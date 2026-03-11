/*
  script.js
  Modular calculator logic + UI controller.
  - Calculator class: pure logic, no DOM
  - UI module: handles DOM, events, keyboard, theme, history persistence
*/

(() => {
  "use strict";

  /* ======================
     Utility helpers
     ====================== */
  const safeLocalStorage = {
    get(key) {
      try {
        return JSON.parse(localStorage.getItem(key));
      } catch (e) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* ignore */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        /* ignore */
      }
    },
  };

  const clampPrecision = (num, maxSig = 12) => {
    // Return a string with a reasonable number of significant digits and trim trailing zeros
    if (!isFinite(num)) return String(num);
    // Use toPrecision to limit floating errors, then trim
    let s = Number(num).toPrecision(maxSig);
    // toPrecision may output exponential form for large/small numbers; try to normalize
    if (s.indexOf("e") !== -1) {
      // Keep exponential representation but make it compact
      return s;
    }
    // Remove trailing zeros on decimals
    if (s.indexOf(".") >= 0) s = s.replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, "");
    return s;
  };

  const nowISO = () => new Date().toISOString();

  /* ======================
     Calculator class (pure logic)
     ====================== */
  class Calculator {
    constructor({historyLimit = 50, storageKey = "calc_history_v1"} = {}) {
      this.currentValue = "0"; // string representation of the currently typed value
      this.previousValue = ""; // stored operand for binary ops
      this.operator = null; // '+', '-', '*', '/'
      this.waitingForNewValue = false; // true when an operator was pressed and we expect a new value
      this.error = null; // error message string when in error state
      this.history = []; // array of {expr, result, timestamp}
      this.historyLimit = historyLimit;
      this.storageKey = storageKey;
      this.loadHistoryFromStorage();
    }

    /* Append a digit (0-9) - manages leading zeros and waitingForNewValue */
    inputDigit(digit) {
      if (this.error) {
        // Starting over after error: clear error state and start a new value
        this.clear();
      }

      if (this.waitingForNewValue) {
        // Start new current value
        this.currentValue = digit;
        this.waitingForNewValue = false;
        return;
      }

      if (this.currentValue === "0") {
        // Replace leading zero
        this.currentValue = digit;
      } else {
        this.currentValue = this.currentValue + digit;
      }
    }

    /* Add decimal point if not present */
    inputDecimal() {
      if (this.error) {
        this.clear();
      }

      if (this.waitingForNewValue) {
        // start new value with '0.'
        this.currentValue = "0.";
        this.waitingForNewValue = false;
        return;
      }

      if (!this.currentValue.includes(".")) {
        this.currentValue = this.currentValue + ".";
      }
    }

    /* Handle operator input. Supports chaining by computing intermediate results. */
    inputOperator(op) {
      if (this.error) return; // ignore operator inputs while in error

      // If there's an operator and we're not waiting for new value, compute first
      if (this.operator && !this.waitingForNewValue) {
        try {
          const computed = this.compute();
          // computed has updated currentValue already
        } catch (e) {
          // compute() will set error internally
          return;
        }
      }

      // Move currentValue to previousValue and set operator
      this.previousValue = this.currentValue;
      this.operator = op;
      this.waitingForNewValue = true;
    }

    /* Compute the result of previousValue (operator) currentValue
       Returns the numeric result or throws controlled exception
    */
    compute() {
      if (!this.operator) return Number(this.currentValue);
      const prev = parseFloat(this.previousValue);
      const curr = parseFloat(this.currentValue);

      if (Number.isNaN(prev) || Number.isNaN(curr)) {
        this.setError("Error");
        throw new Error("Invalid numbers for computation");
      }

      let result;
      switch (this.operator) {
        case "+":
          result = prev + curr;
          break;
        case "-":
          result = prev - curr;
          break;
        case "*":
          result = prev * curr;
          break;
        case "/":
          if (curr === 0) {
            this.setError("Division by 0");
            throw new Error("Division by zero");
          }
          result = prev / curr;
          break;
        default:
          this.setError("Error");
          throw new Error("Unknown operator");
      }

      // Format and store
      const resultStr = clampPrecision(result);
      const expr = `${this.previousValue} ${this.operator} ${this.currentValue}`;

      // Add to history
      this.addHistory(expr, resultStr);

      // Reset state to show result as current value
      this.currentValue = String(resultStr);
      this.previousValue = "";
      this.operator = null;
      this.waitingForNewValue = false;
      return result;
    }

    /* Percent: applies according to standard calculator rules
       If there's a previous value and an operator, current = prev * (current / 100)
       Else current = current / 100
    */
    percent() {
      if (this.error) return;

      const curr = parseFloat(this.currentValue);
      if (Number.isNaN(curr)) return;

      let newVal;
      if (this.previousValue && this.operator) {
        const prev = parseFloat(this.previousValue);
        if (Number.isNaN(prev)) return;
        newVal = prev * (curr / 100);
      } else {
        newVal = curr / 100;
      }

      this.currentValue = clampPrecision(newVal);
      // After percent, we are no longer waiting for a new value
      this.waitingForNewValue = false;
    }

    /* Clear all state */
    clear() {
      this.currentValue = "0";
      this.previousValue = "";
      this.operator = null;
      this.waitingForNewValue = false;
      this.error = null;
    }

    /* Delete last character from current value */
    delete() {
      if (this.error) {
        // clearing error on delete feels natural
        this.clear();
        return;
      }

      if (this.waitingForNewValue) {
        // If waiting for new value, pressing delete should clear operator selection
        this.operator = null;
        this.waitingForNewValue = false;
        return;
      }

      if (this.currentValue.length <= 1) {
        this.currentValue = "0";
      } else {
        this.currentValue = this.currentValue.slice(0, -1);
        // If last char was a dot, keep as proper state
        if (this.currentValue === "-" || this.currentValue === "")
          this.currentValue = "0";
      }
    }

    /* Set an error state with friendly message (does not clear history) */
    setError(message = "Error") {
      this.error = String(message || "Error");
      this.currentValue = this.error;
      // Do not wipe previousValue or history; UI should handle disabling further operations
    }

    /* Return display representation for UI */
    getDisplay() {
      const exprParts = [];
      if (this.previousValue) exprParts.push(this.previousValue);
      if (this.operator) exprParts.push(this.operator);
      if (this.waitingForNewValue) {
        // show operator waiting
      } else if (this.currentValue) {
        // show current value in expression area if there's also a previous
        if (this.previousValue) exprParts.push(this.currentValue);
      }

      const expression = exprParts.join(" ");
      const result = this.currentValue;
      return {expression: expression || "0", result};
    }

    /* History management */
    addHistory(expr, result) {
      const item = {
        expr: String(expr),
        result: String(result),
        timestamp: nowISO(),
      };
      this.history.unshift(item);
      if (this.history.length > this.historyLimit)
        this.history.length = this.historyLimit;
      this.saveHistoryToStorage();
    }

    loadHistoryFromStorage() {
      const stored = safeLocalStorage.get(this.storageKey);
      if (Array.isArray(stored)) {
        this.history = stored.slice(0, this.historyLimit);
      }
    }

    saveHistoryToStorage() {
      safeLocalStorage.set(
        this.storageKey,
        this.history.slice(0, this.historyLimit),
      );
    }

    clearHistory() {
      this.history = [];
      this.saveHistoryToStorage();
    }
  }

  /* ======================
     UI Controller Module
     ====================== */
  const UI = (() => {
    // DOM hooks
    const displayExpressionEl = () =>
      document.getElementById("displayExpression");
    const displayResultEl = () => document.getElementById("displayResult");
    const historyListEl = () => document.getElementById("historyList");
    const keypadEl = () => document.getElementById("keypad");
    const themeToggleEl = () => document.getElementById("themeToggle");
    const clearHistoryBtnEl = () => document.getElementById("clearHistoryBtn");
    const calculatorRoot = () => document.getElementById("calculator");

    let calc = null; // Calculator instance

    /* Initialize UI with a Calculator instance */
    const init = (calculatorInstance) => {
      calc = calculatorInstance;
      bindEvents();
      loadTheme();
      renderAll();
    };

    /* Render display and history */
    const renderAll = () => {
      renderDisplay();
      renderHistory();
    };

    const renderDisplay = () => {
      const disp = calc.getDisplay();
      const exprEl = displayExpressionEl();
      const resEl = displayResultEl();

      if (!exprEl || !resEl) return;

      exprEl.textContent = disp.expression;
      resEl.textContent = disp.result;

      // Error styling
      const root = calculatorRoot();
      if (calc.error) {
        root.classList && root.classList.add("error");
        // disable operator and equals buttons
        setOperatorsDisabled(true);
        // announce error (aria-live on result will contain the error text)
      } else {
        root.classList && root.classList.remove("error");
        setOperatorsDisabled(false);
      }

      // Highlight selected operator button via aria-pressed
      updateOperatorPressedState();
    };

    const formatHistoryItemNode = (item, idx) => {
      const li = document.createElement("li");
      li.className = "history-item";
      li.setAttribute("role", "button"); // clickable
      li.setAttribute("tabindex", "0");
      li.dataset.index = String(idx);

      const expr = document.createElement("div");
      expr.className = "hist-expr";
      expr.textContent = item.expr;

      const res = document.createElement("div");
      res.className = "hist-res";
      res.textContent = item.result;

      li.appendChild(expr);
      li.appendChild(res);
      return li;
    };

    const renderHistory = () => {
      const root = historyListEl();
      if (!root) return;
      // Clear
      root.innerHTML = "";
      if (!Array.isArray(calc.history) || calc.history.length === 0) return;
      calc.history.forEach((item, i) => {
        const node = formatHistoryItemNode(item, i);
        root.appendChild(node);
      });
    };

    const setOperatorsDisabled = (disabled) => {
      const opButtons = document.querySelectorAll(".operator, .equals");
      opButtons.forEach((b) => {
        b.disabled = !!disabled;
      });
    };

    const updateOperatorPressedState = () => {
      const opButtons = document.querySelectorAll(".operator");
      opButtons.forEach((btn) => {
        const val =
          btn.dataset && btn.dataset.value
            ? btn.dataset.value
            : btn.getAttribute("data-value");
        if (val && calc.operator && val === calc.operator) {
          btn.setAttribute("aria-pressed", "true");
          // also focusable style will show because of :focus etc.
        } else {
          btn.setAttribute("aria-pressed", "false");
        }
      });
    };

    /* Handle click events from keypad via delegation */
    const onKeypadClick = (e) => {
      const btn = e.target.closest("button");
      if (!btn || !keypadEl().contains(btn)) return;
      e.preventDefault();

      // Determine action
      const action = btn.dataset.action;
      const type = btn.dataset.type;
      const value = btn.dataset.value;

      if (action) {
        handleAction(action);
      } else if (type === "digit") {
        handleDigit(value);
      } else if (type === "operator") {
        handleOperator(value);
      }
      // render updated UI
      renderAll();
    };

    /* Handle keyboard events */
    const onKeyDown = (e) => {
      if (!document.body.contains(calculatorRoot())) return;

      // Map keys
      const key = e.key;

      // Allow typing into inputs if any (not our UI) - but our page has no input fields
      // Map digits
      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        handleDigit(key);
        renderAll();
        return;
      }

      // Numpad digits
      if (/^Numpad[0-9]$/.test(e.code)) {
        const digit = e.code.slice(-1);
        e.preventDefault();
        handleDigit(digit);
        renderAll();
        return;
      }

      // Decimal
      if (key === "." || key === ",") {
        e.preventDefault();
        handleDecimal();
        renderAll();
        return;
      }

      // Operators
      if (key === "+" || key === "-" || key === "*" || key === "/") {
        e.preventDefault();
        handleOperator(key);
        renderAll();
        return;
      }

      // Percent
      if (key === "%") {
        e.preventDefault();
        handlePercent();
        renderAll();
        return;
      }

      // Enter or '=' evaluate
      if (key === "Enter" || key === "=") {
        e.preventDefault();
        handleEquals();
        renderAll();
        return;
      }

      // Backspace delete
      if (key === "Backspace") {
        e.preventDefault();
        handleDelete();
        renderAll();
        return;
      }

      // Escape clear
      if (key === "Escape") {
        e.preventDefault();
        handleClear();
        renderAll();
        return;
      }

      // If user presses some other keys we ignore
    };

    /* Action handlers */
    const handleDigit = (digit) => {
      if (!calc) return;
      calc.inputDigit(String(digit));
    };

    const handleDecimal = () => {
      if (!calc) return;
      calc.inputDecimal();
    };

    const handleOperator = (op) => {
      if (!calc) return;
      // Normalize common symbols to internal values
      const normalized = op === "×" || op === "x" ? "*" : op === "÷" ? "/" : op;
      calc.inputOperator(normalized);
    };

    const handlePercent = () => {
      if (!calc) return;
      calc.percent();
    };

    const handleClear = () => {
      if (!calc) return;
      calc.clear();
    };

    const handleDelete = () => {
      if (!calc) return;
      calc.delete();
    };

    const handleEquals = () => {
      if (!calc) return;
      try {
        // If an operator exists and waitingForNewValue is true, it means user pressed operator then equals
        // We'll treat currentValue as previousValue if necessary (e.g., 5 + = -> 10 typical calculator repeats behavior not implemented)
        calc.compute();
      } catch (e) {
        // compute sets error state
        console.warn(e && e.message ? e.message : e);
      }
    };

    const handleAction = (action) => {
      switch (action) {
        case "clear":
          handleClear();
          break;
        case "delete":
          handleDelete();
          break;
        case "percent":
          handlePercent();
          break;
        case "equals":
          handleEquals();
          break;
        case "clear-history":
          handleClearHistory();
          break;
        default:
          console.warn("Unknown action:", action);
      }
    };

    const handleClearHistory = () => {
      if (!calc) return;
      calc.clearHistory();
      renderHistory();
    };

    /* History item click/keyboard handler to recall a past calculation */
    const onHistoryClick = (e) => {
      const li = e.target.closest(".history-item");
      if (!li) return;
      const idx = Number(li.dataset.index);
      if (!Number.isFinite(idx)) return;
      const item = calc.history[idx];
      if (!item) return;
      // When recalling, set currentValue to the item's result and clear operator/previous
      calc.currentValue = String(item.result);
      calc.previousValue = "";
      calc.operator = null;
      calc.waitingForNewValue = false;
      calc.error = null;
      renderAll();
    };

    const onHistoryKeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onHistoryClick(e);
      }
    };

    /* Theme handling */
    const THEME_KEY = "calc_theme_pref";

    const loadTheme = () => {
      const saved = safeLocalStorage.get(THEME_KEY);
      const prefersDark =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      const body = document.body;
      if (saved === "dark" || (saved === null && prefersDark)) {
        body.classList.add("dark-theme");
        themeToggleEl() && themeToggleEl().setAttribute("aria-pressed", "true");
      } else {
        body.classList.remove("dark-theme");
        themeToggleEl() &&
          themeToggleEl().setAttribute("aria-pressed", "false");
      }
    };

    const toggleTheme = () => {
      const body = document.body;
      const isDark = body.classList.toggle("dark-theme");
      safeLocalStorage.set(THEME_KEY, isDark ? "dark" : "light");
      themeToggleEl() &&
        themeToggleEl().setAttribute("aria-pressed", isDark ? "true" : "false");
    };

    /* Bind DOM events */
    const bindEvents = () => {
      // Keypad clicks (delegated)
      const kp = keypadEl();
      if (kp) kp.addEventListener("click", onKeypadClick);

      // Keyboard events
      window.addEventListener("keydown", onKeyDown);

      // Theme toggle
      const tbtn = themeToggleEl();
      if (tbtn)
        tbtn.addEventListener("click", (e) => {
          e.preventDefault();
          toggleTheme();
        });

      // Clear history
      const ch = clearHistoryBtnEl();
      if (ch)
        ch.addEventListener("click", (e) => {
          e.preventDefault();
          handleClearHistory();
          renderAll();
        });

      // History interaction
      const hroot = historyListEl();
      if (hroot) {
        hroot.addEventListener("click", onHistoryClick);
        hroot.addEventListener("keydown", onHistoryKeydown);
      }

      // Ensure buttons respond to touch and keyboard natively (they are <button>)

      // Accessibility: allow clicks on display area to focus keypad for keyboard users
      const exprEl = displayExpressionEl();
      const resEl = displayResultEl();
      [exprEl, resEl].forEach((el) => {
        if (el)
          el.addEventListener("click", () => {
            keypadEl() && keypadEl().focus && keypadEl().focus();
          });
      });
    };

    return {init, renderAll};
  })();

  /* ======================
     Bootstrap on DOMContentLoaded
     ====================== */
  document.addEventListener("DOMContentLoaded", () => {
    const calculator = new Calculator({
      historyLimit: 50,
      storageKey: "calc_history_v1",
    });
    UI.init(calculator);
  });
})();
