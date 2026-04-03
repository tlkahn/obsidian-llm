import { App, Scope } from "obsidian";
import { Compartment } from "@codemirror/state";
import { showPanel, EditorView, Panel } from "@codemirror/view";

export function showQuestionBar(
    app: App,
    view: EditorView,
    compartment: Compartment,
    initialText = ""
): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
        let resolved = false;
        let textareaRef: HTMLTextAreaElement | null = null;
        const scope = new Scope();

        function close(result: string | null) {
            if (resolved) return;
            resolved = true;
            view.dispatch({ effects: compartment.reconfigure([]) });
            resolve(result);
            view.focus();
        }

        scope.register(["Mod"], "Enter", () => {
            if (textareaRef) {
                const trimmed = textareaRef.value.trim();
                if (trimmed) close(trimmed);
            }
            return false;
        });

        scope.register([], "Escape", () => {
            close(null);
            return false;
        });

        function panelConstructor(): Panel {
            const dom = buildPanelDOM(initialText, close);
            return {
                dom,
                top: false,
                mount() {
                    app.keymap.pushScope(scope);
                    textareaRef = dom.querySelector("textarea");
                    if (textareaRef) {
                        textareaRef.focus();
                        if (initialText) {
                            textareaRef.selectionStart = textareaRef.selectionEnd =
                                textareaRef.value.length;
                        }
                    }
                },
                destroy() {
                    app.keymap.popScope(scope);
                    if (!resolved) {
                        resolved = true;
                        resolve(null);
                    }
                },
            };
        }

        view.dispatch({
            effects: compartment.reconfigure(showPanel.of(panelConstructor)),
        });
    });
}

function buildPanelDOM(
    initialText: string,
    close: (result: string | null) => void
): HTMLElement {
    const container = document.createElement("div");
    container.className = "llm-prompt-bar";

    const textarea = document.createElement("textarea");
    textarea.className = "llm-prompt-bar-input";
    textarea.placeholder =
        "Ask a question... (Cmd/Ctrl+Enter to submit, Esc to cancel)";
    textarea.value = initialText;
    textarea.rows = 2;

    const buttonRow = document.createElement("div");
    buttonRow.className = "llm-prompt-bar-buttons";

    const submitBtn = document.createElement("button");
    submitBtn.className = "llm-prompt-bar-submit";
    submitBtn.textContent = "Submit";
    submitBtn.addEventListener("click", () => {
        const trimmed = textarea.value.trim();
        if (trimmed) close(trimmed);
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "llm-prompt-bar-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => close(null));

    buttonRow.appendChild(cancelBtn);
    buttonRow.appendChild(submitBtn);

    container.appendChild(textarea);
    container.appendChild(buttonRow);

    return container;
}
