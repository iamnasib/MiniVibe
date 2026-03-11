const todoForm = document.getElementById("todo-form");
const todoInput = document.getElementById("todo-input");
const todoList = document.getElementById("todo-list");
const filterButtons = document.querySelectorAll(".filter-btn");

let todos = [];
let currentFilter = "all";

// Load todos from localStorage
function loadTodos() {
  const storedTodos = localStorage.getItem("todos");
  if (storedTodos) {
    todos = JSON.parse(storedTodos);
  } else {
    todos = [];
  }
}

// Save todos to localStorage
function saveTodos() {
  localStorage.setItem("todos", JSON.stringify(todos));
}

// Create a single todo item element
function createTodoElement(todo) {
  const li = document.createElement("li");
  li.className = "todo-item";
  li.dataset.id = todo.id;
  if (todo.completed) {
    li.classList.add("completed");
  }

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "todo-checkbox";
  checkbox.checked = todo.completed;
  checkbox.setAttribute(
    "aria-label",
    `Mark todo "${todo.text}" as ${todo.completed ? "incomplete" : "completed"}`,
  );
  checkbox.addEventListener("change", () => toggleTodo(todo.id));

  const span = document.createElement("span");
  span.className = "todo-text";
  span.textContent = todo.text;

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "todo-delete-btn";
  deleteBtn.setAttribute("aria-label", `Delete todo "${todo.text}"`);
  deleteBtn.textContent = "×";
  deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

  li.appendChild(checkbox);
  li.appendChild(span);
  li.appendChild(deleteBtn);

  return li;
}

// Render the todo list based on current filter
function renderTodos() {
  todoList.innerHTML = "";
  let filteredTodos = [];
  switch (currentFilter) {
    case "active":
      filteredTodos = todos.filter((todo) => !todo.completed);
      break;
    case "completed":
      filteredTodos = todos.filter((todo) => todo.completed);
      break;
    default:
      filteredTodos = todos;
  }

  if (filteredTodos.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "visually-hidden";
    emptyMessage.textContent = "No todos to display";
    todoList.appendChild(emptyMessage);
  } else {
    filteredTodos.forEach((todo) => {
      const todoElement = createTodoElement(todo);
      todoList.appendChild(todoElement);
    });
  }
}

// Add a new todo
function addTodo(text) {
  if (!text.trim()) return;
  const newTodo = {
    id: Date.now().toString(),
    text: text.trim(),
    completed: false,
  };
  todos.push(newTodo);
  saveTodos();
  renderTodos();
}

// Toggle the completion status of a todo
function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  todo.completed = !todo.completed;
  saveTodos();
  renderTodos();
}

// Delete a todo
function deleteTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  saveTodos();
  renderTodos();
}

// Set current filter and update UI
function setFilter(filter) {
  currentFilter = filter;
  filterButtons.forEach((btn) => {
    const isSelected = btn.dataset.filter === filter;
    btn.classList.toggle("selected", isSelected);
    btn.setAttribute("aria-pressed", isSelected.toString());
  });
  renderTodos();
}

// Handle form submit event to add todo
todoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = todoInput.value;
  addTodo(value);
  todoInput.value = "";
  todoInput.focus();
});

// Handle filter button clicks
filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setFilter(btn.dataset.filter);
  });
});

// Initial load
loadTodos();
renderTodos();
setFilter(currentFilter);
