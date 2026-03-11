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


# General LLM Model to be used for all the LLM calls in the workflow | You can change the model and its parameters here to see how it affects the output of the workflow.
llm=ChatOpenAI(model="gpt-5-mini",api_key=os.getenv('OPENAI_API_KEY'),store=False)

# LLM with structured output for generating the plan. The output of this LLM call will be structured according to the Files model defined above.
planner=llm.with_structured_output(Files)

class ValidationAndTechStack(BaseModel):
    is_valid:bool=Field(
        description="Whether the user's prompt/idea is valid to begin plan and code generation"
    )
    tech_stack:str=Field(
        description="Tech stack to use if the user's prompt/idea is valid"
    )

# LLM with structured output for validating the user's prompt and also to decide the tech stack to be used for the project based on the user's prompt.
validator = llm.with_structured_output(ValidationAndTechStack)

class GeneratedFile(BaseModel):
    file:File=Field(
        description="File Details"
    )
    code:str=Field(
        description="Generated content for this file"
    )

# LLM with structured output for generating the code for each file. The output of this LLM call will be structured according to the GeneratedFile model defined above.
generator = llm.with_structured_output(GeneratedFile)

class Evaluation(BaseModel):
    score:int=Field(
        description="Score out of 10 to evaluate the final code generated based on the user's prompt and the initial plan. The evaluation should consider how well the final code meets the requirements of the user's prompt and how well it follows the initial plan. Score less than or equal to 6 means the code will be given for refinement and greater than 6 means the code doesn't need refinement"
    )
    feedback:str=Field(
        description="Detailed feedback on the final code generated, highlighting its strengths or areas for improvement based on the user's prompt and the initial plan."
    )

# LLM with structured output for evaluating the Final code and decide whether to refine or continue
evaluator = llm.with_structured_output(Evaluation)

class State(TypedDict):
    prompt:str
    tech_stack:str
    files:Files
    current_file_index:int
    current_generated_file:GeneratedFile|None
    generated_files:Annotated[list[GeneratedFile],operator.add]
    evaluated_files: Annotated[list[Evaluation],operator.add] 
    next_step:Literal["generate_file","synthesizer"]
    final_code:str

# For parallel execution of file generation | CURRENTLY NOT IN USE
class WorkerState(TypedDict):
    file:File
    completed_files:Annotated[list,operator.add]

def validator_and_tech_stack_decision(state:State):
    """Validator and tech stack node for validating the user's prompt and also to decide the tech stack to be used for the project based on the user's prompt."""

    print("")

    validator_and_tech_stack_system_instruction='''
        You are a validator and tech stack decision agent for a code generation workflow. Your task is to validate the user's prompt/idea for a project and also to decide the most suitable tech stack for the project based on the user's prompt.
    '''

    val_and_tech = validator.invoke(
        [
            SystemMessage(content=validator_and_tech_stack_system_instruction),
            HumanMessage(content=f"User' idea/prompt: {state['prompt']}")
        ]
    )
    print(val_and_tech)
    if val_and_tech.is_valid:
        return {
            "tech_stack":val_and_tech.tech_stack,
            "next_step":"orchestrator"
            }
    return {"next_step":"END"}

def orchestrator(state:State):
    """Orchestrator node to generate the plan for the project and also to keep track of the current state of the workflow"""

    print("Generating a plan for the project...")
    project_files=planner.invoke(
        [
            SystemMessage(content=f"Generate a plan for the code files only for user described project. UI should be too good and return the plan in order the files should be generated. DO NOT INCLUDE FOLDERS, JUST THE CODE FILES. Here is the pre-decided techstack for the project {state['tech_stack']}"),
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
    """Decide whether to generate the next file or to synthesize the final code based on the current state of the workflow"""

    if state["current_file_index"]>=len(state["files"]):
        print("All files generated")
        return {"next_step":"synthesizer"}
    
    print(f"Current file index: {state["current_file_index"]}")
    return {"next_step":"generate_file"}

def router_decision_executor(state:State):
    """Route to the appropriate node based on the decision made in the router node"""
    return state["next_step"]
    #     return "orchestrator"
    # elif state["next_step"]=="synthesizer":
    #     return "synthesizer"
    # elif state["next_step"]=="generate_file":
    #     return "generate_file"
    # else:
    #     return "END"

# LLM call for creation of files
def generate_file(state:State):
    """Generate code for the current file based on the plan generated by the orchestrator node and also based on the previously generated files to maintain consistency in the codebase. Also make sure to follow the initial plan while generating the code for each file."""

    file=state["files"][state["current_file_index"]]

    if state["generated_files"]:
        previous_files_context = "\n\n".join([i[1] for i in state["generated_files"]])

    system_message=f"""
                    You are an genius and most experienced developer.

                    Generate the FULL content of the file requested.
                    Return ONLY code. No explanations. JUST THE CODE LIKE WRITTEN IN FILE
                    Make sure the file works with previously generated files and also according to the initially generated plan:
                    """

    if len(state["evaluated_files"])>state["current_file_index"]:
        if state["evaluated_files"][state["current_file_index"]].score<=6:
            print(state["evaluated_files"][state["current_file_index"]].feedback)
            system_message=f"""
                    You are an genius and most experienced developer.

                    Please refine the content of the file requested based on the evaluation Feedback:
                    {state["evaluated_files"][state["current_file_index"]].feedback}
                    .
                    Return ONLY code. No explanations. JUST THE CODE LIKE WRITTEN IN FILE
                    Make sure the file works with previously generated files and also according to the initially generated plan:    
                    """
            

    print(f"Generating code for the file: {file.name} ({state['current_file_index']+1} of {len(state['files'])})")

    generated_file=generator.invoke(
        [
            SystemMessage(content=f"""
                {system_message}

                     {['\n\n'.join((f.name,f.description)) for f in state['files']]}
                """
            ),
            HumanMessage(content=f"""
                ORIGINAL USER PROMPT(Project idea):
                {state['prompt']}

                Previously generated files:
                {previous_files_context if state["generated_files"] else "No previously generated files"}

                Current file:
                File name: {file.name}
                Description: {file.description}
                """
            )
        ]
    )
    print(f"Code generated for the file: {file.name}")
    return {
        "current_generated_file":(generated_file.file,generated_file.code)
        # "generated_files":[(generated_file.file,generated_file.code)]
        }

# For evaluation and refinement of the generated code
def evaluator_and_refinement_decision(state:State):
    """For evaluating the generated code for the current file based on the user's original prompt and the initial plan and to decide whether to send it back for refinement or to move ahead"""

    print(f"Evaluating the generated code for the file: {state['files'][state['current_file_index']].name}")
    current_file=state["current_generated_file"]
    evaluation= evaluator.invoke(
        [
            SystemMessage(content=f'''
                          You are a professional and senior programmer who evaluates the code generated by others and give a score and feedback to the generated code based on the user's original prompt/idea, tech stack and initial plan. Score less than or equal to 6 means the code will be given for refinement and greater than 6 means the code doesn't need refinement.
                          ----------------------------------------------
                          User's original Prompt/Idea: {state["prompt"]}
                          Teck Stack: {state["tech_stack"]}
                          Initial Plan: {['\n\n'.join((f.name,f.description)) for f in state['files']]}
                          
                          '''),
            HumanMessage(content=f'''
                         Code for file {state['files'][state["current_file_index"]].name}:
                            {current_file[1]}
                         ''')
        ]
    )
    print(f"Evaluation completed for the file: {state['files'][state['current_file_index']].name} with score: {evaluation.score}")

    if evaluation.score <= 6:
        print("Code needs refinement. Sending it back for regeneration.")
        return {"next_step":"generate_file", "evaluated_files":[evaluation]}
    
    print("Code is good. Moving to the next file or synthesizer.")
    return {
        "next_step":"router",
        "evaluated_files":[evaluation],
        "generated_files":[current_file],
        "current_file_index":state["current_file_index"]+1
        }

# For parallel execution of file generation | CURRENTLY NOT IN USE
# def llm_call(state:WorkerState):
#     """Genrate code for the given file"""

#     # file_code=llm.invoke(
#     #     [
#     #         SystemMessage(content=f"Generate code for the following file: {state.file.name} with description: {state.file.description}"),
#     #         HumanMessage(content=f"Here are the completed files: {state.completed_files}")
#     #     ]
#     # )
#     print(f"Generating code for the file: {state['file'].name}")
#     print(f"{state.get('completed_files',[])}")
#     file=llm.invoke(
#         [
#             SystemMessage(content="Write code for the file provided based on the file description"),
#             HumanMessage(content=f"Here is the file name: {state['file'].name} and description: {state['file'].description}")
#         ]
#     )
#     print(f"Code generated for the file: {state['file'].name}")
#     return {"completed_files":[file.content]}

def synthesizer(state:State):
    """Synthesize full code from all the files"""
    print("Synthesizing the final code from all the completed files...")
    generated_files=state["generated_files"]

    completed_project_files = "\n\n-----NEW FILE-----\n\n".join([i[1] for i in generated_files])
    print("Final code synthesized successfully.")
    return {"final_code": completed_project_files}

# For Parallel assi
def assign_workers(state:State):
    """Assign a worker to each file in the plan"""
    print("Assigning workers to the files...")
    return [Send("llm_call",{"file":f}) for f in state['files']]

workflow=StateGraph(State)

workflow.add_node("validator_and_tech_stack_decision",validator_and_tech_stack_decision)
workflow.add_node("orchestrator",orchestrator)
# workflow.add_node("llm_call",llm_call)
workflow.add_node("router",router)
workflow.add_node("generate_file",generate_file)
workflow.add_node("evaluator_and_refinement_decision",evaluator_and_refinement_decision)
workflow.add_node("synthesizer",synthesizer)


workflow.add_edge(START,"validator_and_tech_stack_decision")
workflow.add_conditional_edges(
    "validator_and_tech_stack_decision",router_decision_executor,{
        'orchestrator':'orchestrator',
        'END':END
    }
)
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
workflow.add_edge("generate_file","evaluator_and_refinement_decision")
workflow.add_conditional_edges(
    "evaluator_and_refinement_decision", router_decision_executor,{
        "router":"router",
        "generate_file":"generate_file"
    }
)
# workflow.add_edge("evaluator_and_refinement_decision","router")
workflow.add_edge("synthesizer",END)

worker=workflow.compile()

# Take prompt from user
user_prompt= input('Enter your prompt here: ')

# Main invoke point 
state=worker.invoke({"prompt":f"{user_prompt}"})

if len(state['generated_files']) > 0:
    with open("code.txt","w",encoding='utf-8') as code:
        code.write(state['final_code'])