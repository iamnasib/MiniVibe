import os
import operator
import dotenv
from typing import TypedDict,Annotated,List
from typing_extensions import Literal
from pydantic import BaseModel,Field

from langchain_openai import ChatOpenAI
from langchain.messages import HumanMessage, SystemMessage

from langgraph.graph import StateGraph,START,END
from langgraph.types import Send

dotenv.load_dotenv()

class File(BaseModel):
    name:str=Field(
        description="Name for this file of the project"
    )
    description:str=Field(
        description="Brief Desciption what this file is about and what features or points to consider in creating this file"
    )

class Files(BaseModel):
    files:List[File]=Field(
        description="Files of the project"
    )

llm=ChatOpenAI(model="gpt-4.1-mini",api_key=os.getenv('OPENAI_API_KEY'),store=False)

planner=llm.with_structured_output(Files)

class State(TypedDict):
    prompt:str
    files:list[Files]
    current_file_index:int
    completed_files:Annotated[list,operator.add]
    next_step:Literal["generate_file","synthesizer"]
    final_code:str

# For parallel execution of file generation | CURRENTLY NOT IN USE
class WorkerState(TypedDict):
    file:File
    completed_files:Annotated[list,operator.add]

def orchestrator(state:State):
    """Genrated a plan for the project"""
    print("Generating a plan for the project...")
    project_files=planner.invoke(
        [
            SystemMessage(content="Generate a plan for the code file only for user described project. UI should be too good and return the plan in order the files should be generated. DO NOT INCLUDE FOLDERS, JUST THE CODE FILES"),
            HumanMessage(content=f"Here is the user Prompt: {state['prompt']}")
        ]
    )
    print("Plan Generated: ",project_files.files)
    return {
        "files":project_files.files,
        "current_file_index":0,
        }

# For routing according to the logic
def router(state:State):
    """Route next step to the appropriate node"""

    if state["current_file_index"]>=len(state["files"]):
        print("All files generated")
        return {"next_step":"synthesizer"}
    
    print(f"Current file index: {state["current_file_index"]}")
    return {"next_step":"generate_file"}

def router_decision_executor(state:State):
    """"""
    if state["next_step"]=="synthesizer":
        return "synthesizer"
    else:
        return "generate_file"

# LLM call for creation of files
def generate_file(state:State):
    """Genrate code for the given file"""
    file=state["files"][state["current_file_index"]]

    previous_files_context = "\n\n".join(state["completed_files"])

    print(f"Generating code for the file: {file.name} ({state['current_file_index']+1} of {len(state['files'])})")

    generated_file=llm.invoke(
        [
            SystemMessage(content=f"""
                You are an expert frontend developer.

                Generate the FULL content of the file requested.
                Return ONLY code. No explanations. JUST THE CODE LIKE WRITTEN IN FILE
                Make sure the file works with previously generated files and also according to the initially generated plan:
                     {['\n\n'.join((f.name,f.description)) for f in state['files']]}
                """
            ),
            HumanMessage(content=f"""
                ORIGINAL USER PROMPT(Project idea):
                {state['prompt']}

                Previously generated files:
                {previous_files_context}

                Now generate this file:
                File name: {file.name}
                Description: {file.description}
                """
            )
        ]
    )
    print(f"Code generated for the file: {file.name}")
    return {
        "completed_files":[f"FILE: {file.name}\n{generated_file.content}"],
        "current_file_index":state["current_file_index"]+1
        }

# For parallel execution of file generation | CURRENTLY NOT IN USE
def llm_call(state:WorkerState):
    """Genrate code for the given file"""

    # file_code=llm.invoke(
    #     [
    #         SystemMessage(content=f"Generate code for the following file: {state.file.name} with description: {state.file.description}"),
    #         HumanMessage(content=f"Here are the completed files: {state.completed_files}")
    #     ]
    # )
    print(f"Generating code for the file: {state['file'].name}")
    print(f"{state.get('completed_files',[])}")
    file=llm.invoke(
        [
            SystemMessage(content="Write code for the file provided based on the file description"),
            HumanMessage(content=f"Here is the file name: {state['file'].name} and description: {state['file'].description}")
        ]
    )
    print(f"Code generated for the file: {state['file'].name}")
    return {"completed_files":[file.content]}

def synthesizer(state:State):
    """Synthesize full code from all the files"""
    print("Synthesizing the final code from all the completed files...")
    completed_files=state['completed_files']

    completed_project_files = "\n\n-------------\n\n".join(completed_files)
    print("Final code synthesized successfully.")
    return {"final_code": completed_project_files}

# For Parallel assi
def assign_workers(state:State):
    """Assign a worker to each file in the plan"""
    print("Assigning workers to the files...")
    return [Send("llm_call",{"file":f}) for f in state['files']]

workflow=StateGraph(State)

workflow.add_node("orchestrator",orchestrator)
# workflow.add_node("llm_call",llm_call)
workflow.add_node("router",router)
workflow.add_node("generate_file",generate_file)
workflow.add_node("synthesizer",synthesizer)


workflow.add_edge(START,"orchestrator")
workflow.add_edge("orchestrator","router")
# workflow.add_conditional_edges(
#     "orchestrator",assign_workers,['llm_call']
# )
# workflow.add_edge("llm_call","synthesizer")
# workflow.add_edge("synthesizer",END)
workflow.add_conditional_edges(
    "router",router_decision_executor,{
        'generate_file':'generate_file',
        'synthesizer':'synthesizer'
        }
)
workflow.add_edge("generate_file","router")
workflow.add_edge("synthesizer",END)

worker=workflow.compile()

state=worker.invoke({"prompt":"I want a single landing page for my restaurant named as Kashmiri Delight which is completely interactive and eye catchy"})

with open("code.txt","w",encoding='utf-8') as code:
    code.write(state['final_code'])