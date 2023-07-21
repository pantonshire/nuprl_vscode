const vscode = acquireVsCodeApi();

const exprInput = document.getElementById('expr_input');
const reduceButton = document.getElementById('reduce');
const reduceAllButton = document.getElementById('reduce_all');
const errorText = document.getElementById('error_text');
const history = document.getElementById('history');
const historyReducedHeading = document.getElementById('history_reduced_heading');

function runReduce(maxSteps) {
    const expr = exprInput.innerText;
    vscode.postMessage({
        command: 'reduce',
        maxSteps: maxSteps,
        expr: expr
    });
}

function appendToHistory(input, reduced) {
    const historyInput = document.createElement('p');
    historyInput.classList.add('history_cell');
    historyInput.innerText = input;

    const historyReduced = document.createElement('p');
    historyReduced.classList.add('history_cell');
    historyReduced.innerText = reduced;

    historyReducedHeading.after(historyInput, historyReduced);
}

window.addEventListener('message', (event) => {
    const message = event.data;

    if (message.command === 'display_reduced') {
        // if (message.error) {
        //     errorText.innerText = 'Error: ' + message.error;
        // } else {
        //     exprInput.innerText = message.reduced;
        //     errorText.innerText = '';
        //     appendToHistory(message.original, message.reduced);
        // }

        if (message.original && message.reduced) {
            exprInput.innerText = message.reduced;
            errorText.innerText = '';
            appendToHistory(message.original, message.reduced);
        }

        if (document.activeElement === exprInput) {
            const range = document.createRange();
            range.setStart(exprInput.childNodes[0], exprInput.innerText.length);
            range.setEnd(exprInput.childNodes[0], exprInput.innerText.length);

            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
});

reduceButton.addEventListener('click', (event) => {
    runReduce(1);
});

reduceAllButton.addEventListener('click', (event) => {
    runReduce(null);
});

exprInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.ctrlKey) {
        runReduce(1);
        event.preventDefault();
        event.stopPropagation();
    }
});

exprInput.focus();
