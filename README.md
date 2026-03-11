# _MiniVibe_

A mini vibe-coding tool

## Overview

MiniVibe is a mini and simplified version of the vibe-coding platforms, created as a learning project to understand the working of these platform internally. It is built using python and leverages LangChain & LangGraph for creating an agent like experience and is powered by OpenAI models.

**I built this project for:**

- Understand the architecture behind AI coding platforms
- Implement a stateful multi-step workflow using LangGraph
- Create a portfolio piece showcasing AI/LLM integration skills

> **Note**: This is a learning project(for now) to understand the underlying concepts of the vibe-coding platforms and to make skills more stronger

## Features

- **Validation and Tech stack Decider**: Validates the user prompt and decides the tech stack to be used for the project
- **Intelligent Planning**: Automatically determines what files are needed for your project
- **Sequential Code Generation**: Generates files in order with context awareness
- **Multi-step Workflow**: Uses LangGraph's state management for complex orchestration
- **Structured Output**: Leverages Pydantic models for reliable LLM responses
- **Context Preservation**: Each file generation considers previously created files
- **Evaluation and Refinement**: Evaluates generated code and allows for regeneration if quality is low
- **Complete Project Output**: Currently only generates a single `txt` file with the complete code

## Tech Stack

- **Python** - Core language
- **LangChain** - LLM application framework
- **LangGraph** - Stateful workflow orchestration
- **OpenAI** - AI model provider
- **Pydantic** - Structured output validation

## Architecture

The workflow implements a graph-based state machine with the following nodes:

```
START → Validator & Tech Stack decision → Orchestrator → Router ⟷ Generate File → Evaluator & Refinement Decision → Synthesizer → END
                                                            ↓
                                             (loops until all files generated)
```

**Workflow Nodes:**

1. **Validator & Tech Stack Decision**:
   - Validates user prompt
   - Determines appropriate tech stack based on project requirements

2. **Orchestrator**:
   - Uses structured output to generate a file plan
   - Returns ordered list of files to create

3. **Router**:
   - Checks if all files have been generated
   - Routes to either `generate_file` or `synthesizer`

4. **Generate File**:
   - Generates code for current file
   - Maintains context from previously generated files
   - Increments file counter

5. **Evaluator & Refinement Decision**:
   - Evaluates generated code quality
   - If score is low, routes back to `generate_file` for regeneration
   - If score is good, moves to next file or synthesizer

6. **Synthesizer**:
   - Combines all generated files
   - Formats output with file separators
   - Writes final code to `code.txt`

**State Management:**
The workflow maintains state across all nodes including:

- User prompt
- Tech stack
- List of planned files
- Current file index
- Current generated file
- Generated files with code
- Evaluations of generated files
- Next step in the workflow
- Final synthesized output

## Installation

### Prerequisites

- Python 3.8 or higher
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

### Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/iamnasib/MiniVibe.git
   cd minivibe
   ```

2. **Create a virtual environment** (recommended)

   ```bash
   python -m venv venv

   # On macOS/Linux
   source venv/bin/activate

   # On Windows
   venv\Scripts\activate
   ```

3. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**
   ```bash
   # Create a .env file in the project root
   echo "OPENAI_API_KEY=your-api-key-here" > .env
   ```

## Usage

### Current Version (v0.2)

To use:

1. **Run the script**:

   ```bash
   python main.py
   ```

2. **Enter the prompt in the CLI when prompted**:

   ```bash
   Enter your prompt here:
   ```

3. **Output**: Generated code will be saved to `code.txt` in the project directory

## Expected Output

The tool will:

1. Print the file plan to console
2. Show generation progress for each file
3. There may other print statements as this is a learning project and I have added print statements to understand the flow and for debugging purposes
4. Save all generated code to `code.txt` with file separator:

```
-----NEW FILE-----
```

## Contributing

Feedback and suggestions are welcome! If you try this project or review the code, please feel free to:

- Open an issue for bugs or feature requests
- Submit a pull request with improvements
- Share your thoughts and feedback

## Known Limitations

- **Single output file**: All code saved to one `code.txt` instead of separate files
- **No error handling**: Limited validation of generated code
- **Fixed model**: Currently uses GPT-5-mini only
- **No parallel generation**: Files generated sequentially, no fan-out implemented

## Troubleshooting

**Common Issues:**

1. **"OpenAI API Error"**
   - Ensure your API key is correctly set in `.env`
   - Check you have sufficient API credits
   - Verify the model name is correct (gpt-5-mini)

2. **"Module not found"**
   - Make sure you've installed all requirements: `pip install -r requirements.txt`
   - Activate your virtual environment if using one

3. **"Empty output file"**
   - Check console output for errors during generation
   - Verify the prompt is descriptive enough for the LLM to understand

4. **Poor code quality**
   - Try more detailed prompts with specific requirements
   - Add technology stack preferences to your prompt
   - Mention UI/UX requirements explicitly

## Development Notes

This project was built primarily by working through the official LangChain and LangGraph documentation, without relying heavily on AI assistance for code generation. The goal was to deeply understand:

- How to structure LLM workflows with state management
- Implementing conditional routing in graph-based systems
- Using structured outputs for reliable LLM responses
- Building context-aware multi-step generation pipelines

The parallel execution code (currently commented out) represents an exploration of fan-out patterns in LangGraph, which had a limitation, AI Didn't knew the context of other files because each file was generated parallely.

## License

MIT License - feel free to use this for learning purposes.

## Version History

| Version | Date              | Changes                                            |
| ------- | ----------------- | -------------------------------------------------- |
| 0.1     | February 14, 2026 | Initial release                                    |
| 0.2     | March 12, 2026    | Added validation, tech stack decider and evaluator |

---

**Built with curiosity and documentation reading** 📚

Questions? Found a bug? Feel free to open an issue!
