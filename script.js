let popups = [];

// Creates and displays a popup modal with specified content and buttons
// buttonObjects is an array of objects with 'text', 'action', and optional 'bad' (display as red) properties
function createPopup(bodyContent, headerContent, buttonObjects=[], closeAction=()=>{}) {
    const overlay = document.createElement("div");
    overlay.classList.add("popup-overlay");

    const container = document.createElement("div");
    container.classList.add("popup-container");

    const headerDiv = document.createElement("div");
    headerDiv.classList.add("popup-header");

    const headerText = document.createElement("span");
    headerText.innerHTML = headerContent;
    headerDiv.appendChild(headerText);

    const closeBtn = document.createElement("button");
    closeBtn.innerText = "×";
    closeBtn.classList.add("close");
    closeBtn.addEventListener("click", () => {
        overlay.classList.remove("visible");
        setTimeout(()=>overlay.remove(), 200);
        closeAction();
    });
    headerDiv.appendChild(closeBtn);

    container.appendChild(headerDiv);

    const bodyDiv = document.createElement("div");
    bodyDiv.style.padding = "15px";
    bodyDiv.classList.add("popup-body");
    if (typeof bodyContent === "string") {
        bodyDiv.innerHTML = bodyContent;
    } else {
        bodyDiv.appendChild(bodyContent);
    }
    container.appendChild(bodyDiv);

    const footerDiv = document.createElement("div");
    footerDiv.classList.add("popup-footer");
    container.appendChild(footerDiv);

    for (let button of buttonObjects) {
        const buttonElem = document.createElement("button");
        buttonElem.innerHTML = button.text;
        if (button?.bad === true) {
            buttonElem.classList.add("bad");
        }
        buttonElem.onclick = () => {
            popups.filter(p => p !== popup);
            button.action();
            overlay.classList.remove("visible");
            setTimeout(()=>overlay.remove(), 200);
        };
        footerDiv.appendChild(buttonElem);
    }

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    overlay.getBoundingClientRect(); // We need getBoundingClientRect to trigger a repaint. If not, the browser skips animating the element and acts like it was always visible.
    overlay.classList.add("visible");

    let popup = {
        overlay: overlay,
        container: container,
        close: () => closeBtn.click()
    };

    popups.push(popup);

    return popup;
}

function createBannerNotification(content, time=5000) {
    const banner = document.createElement("div");
    banner.innerHTML = content;
    banner.offsetHeight;
    banner.classList.add("banner-notification");
    document.body.appendChild(banner);

    banner.getBoundingClientRect(); // Again, triggering a repaint.
    banner.classList.add("visible");

    setTimeout(() => {
        banner.classList.remove("visible");
        setTimeout(() => banner.remove(), 200);
    }, time);
}

function closeAllPopups() {
    popups.forEach(popup => popup.close());
    popups = [];
}

const gateTypes = {
    input: new GateInterface('Input', 'input', 'Click this gate to toggle its state.', 0, 1, (inputs, toggle) => toggle, { switchable: true }),
    output: new GateInterface('Output', 'output', 'Connect wires to this gate in order to complete the level.', 1, 0, (inputs) => [inputs[0]]),
    and: new GateInterface('AND', 'and', 'This gate only turns on when both inputs are on.', 2, 1, (inputs) => [inputs[0] && inputs[1]]),
    and3: new GateInterface('AND', 'and3', 'This gate only turns on when all inputs are on.', 3, 1, (inputs) => [inputs[0] && inputs[1] && inputs[2]]),
    or: new GateInterface('OR', 'or', 'This gate turns on when at least one input is on.', 2, 1, (inputs) => [inputs[0] || inputs[1]]),
    or3: new GateInterface('OR', 'or3', 'This gate turns on when at least one input is on.', 3, 1, (inputs) => [inputs[0] || inputs[1] || inputs[2]]),
    not: new GateInterface('NOT', 'not', 'This gate inverts its input.', 1, 1, (inputs) => [!inputs[0]]),
    xor: new GateInterface('XOR', 'xor', 'This gate turns on when only one input is on.', 2, 1, (inputs) => [(inputs[0] ^ inputs[1]) == 1]),
    xnor: new GateInterface('XNOR', 'xnor', 'This gate turns on when exactly one input is off.', 2, 1, (inputs) => [(inputs[0] ^ inputs[1]) == 0]),
    nor: new GateInterface('NOR', 'nor', 'This gate turns on only when both inputs are off.', 2, 1, (inputs) => [!(inputs[0] || inputs[1])]),
    nand: new GateInterface('NAND', 'nand', 'This gate turns on only when both inputs are not on.', 2, 1, (inputs) => [!(inputs[0] && inputs[1])]),
    clock: new GateInterface('Clock', 'clock', 'This gate turns on and off at 1 second delays.', 0, 1, (inputs, emission) => emission, { emits: true, emitter: (callback) => {let value = false; const interval = setInterval(() => {value = !value; callback([value]);}, 1000); return () => {clearInterval(interval)}} }),
    halfadder: new GateInterface('Half Adder', 'halfadder', 'This circuit turns on the first output when the inputs are different, and turns on the second output when both inputs are on.', 2, 2, (inputs) => {
        const sum = (inputs[0] ^ inputs[1]) == 1;
        const carry = inputs[0] && inputs[1];
        return [sum, carry];
    }),
    fulladder: new GateInterface('Full Adder', 'fulladder', 'This circuit turns on the first output when an odd number of inputs are on, and also turns on the second output when at least two inputs are on', 3, 2, (inputs) => {
        const a = inputs[0];
        const b = inputs[1];
        const carryIn = inputs[2];
        const sum = (a ^ b) ^ carryIn;
        const carryOut = (a && b) || (carryIn && (a ^ b));
        return [sum, carryOut];
    })
};

const unlockedGates = [];

// Generate a truth table from a function that accepts an array of Booleans and returns an array of Booleans. The output will look something like:
/*
{ input: [0, 0], output: [0] },
{ input: [0, 1], output: [0] },
{ input: [1, 0], output: [0] },
{ input: [1, 1], output: [1] },
*/
function generateTruthTable(fn, numInputs, numOutputs) {
    const table = [];

    const numRows = Math.pow(2, numInputs); // Since we need all possible combinations of inputs, we can use binary to do that. The amount of unique binary combinations given amount of digits n is always 2^n

    const input = Array(numInputs).fill(false); // Creating an array with length of numInputs filled with false values, like [false, false, false] if numInputs were 3.

    for (let i = 0; i < numRows; i++) {

        const output = fn(input); // Pass the inputs to the function which will evaluate the output(s) to be added to the table.

        // The inputs and outputs are in a true or false array. We map them to 1 or 0 instead.
        table.push({
            input: input.map(value => value ? 1 : 0),
            output: output.map(value => value ? 1 : 0)
        });

/*
000
001
010
011
100
101
110
111
*/
        // Binary counter. For example, we have 001, the digit is 1, so we change it to 0 (now 000), and move on to the next (middle) digit. So after that, the number would change to 010, and we'd stop incrementing digits, because 010 is the number that comes after 001 in binary.
        for (let j = numInputs - 1; j >= 0; j--) {
            if (!input[j]) { // If the binary digit is 0 (false), change it 1 (true) and stop (that's the number we need).
                input[j] = true;
                break;
            } else { // If the binary digit is 1 (true), change it to 0, and move on to increment the next digit.
                input[j] = false;
            }
        }
    }

    return table;
}

const levels = [
    {
        truth: generateTruthTable((inputs) => inputs, 1, 1), // Truth table for the level, used for a visual display and internally for solution checking
        name: "Basic Connection",
        description: "Connect the input gate to the output gate.",
        hint: "Click and drag the input orange node to the output orange node.",
        bestAmount: 0, // Least amount of gates possible
        permitted: [], // Gates the player is allowed to use in the level
        unlocks: [gateTypes.input, gateTypes.output] // Gates the player unlocks after completing the level
    },
    {
        truth: generateTruthTable(gateTypes.not.evaluate, 1, 1),
        name: "The NOT Gate",
        description: "Construct a NOT gate, which inverts the input.",
        hint: "Drag the NOT gate from the toolbar onto the canvas and connect it between the input and output.",
        bestAmount: 1,
        permitted: [gateTypes.not],
        unlocks: [gateTypes.not]
    },
    {
        truth: generateTruthTable(gateTypes.and.evaluate, 2, 1),
        name: "The AND Gate",
        description: "An AND gate turns on only when both inputs are on. Click the inputs once connected to see how it works.",
        hint: "Drag the AND gate from the toolbar onto the canvas and connect it between the inputs and output.",
        bestAmount: 1,
        permitted: [gateTypes.and],
        unlocks: [gateTypes.and]
    },
    {
        truth: generateTruthTable(gateTypes.or.evaluate, 2, 1),
        name: "The OR Gate",
        description: "An OR gate turns at least one input is on. Click the inputs once connected to see how it works.",
        hint: "Drag the OR gate from the toolbar onto the canvas and connect it between the inputs and output.",
        bestAmount: 1,
        permitted: [gateTypes.or],
        unlocks: [gateTypes.or]
    },
    {
        truth: generateTruthTable(gateTypes.nand.evaluate, 2, 1),
        name: "The NAND Gate",
        description: "Construct a NAND gate, which is the inverse of an AND gate.",
        hint: "You need to invert the signal of an AND gate. What gate inverts the signal?",
        bestAmount: 2,
        permitted: [gateTypes.not, gateTypes.and],
        unlocks: [gateTypes.nand, gateTypes.nor]
    },
    {
        truth: generateTruthTable(gateTypes.or3.evaluate, 3, 1),
        name: "Combining OR Gates",
        description: "Construct an OR gate, but with three inputs.",
        hint: "No hint is provided for this level.",
        bestAmount: 2,
        permitted: [gateTypes.or],
        unlocks: [gateTypes.or3, gateTypes.and3]
    },
    {
        truth: generateTruthTable(gateTypes.xor.evaluate, 2, 1),
        name: "The XOR Gate",
        description: "Construct an XOR gate, which is on if exactly one input is on.",
        hint: "Think of what gates match the conditions. An OR gate matches two of the conditions, but not the last one. You need to turn off if both are on, which a NAND gate can do. What gate can combine two conditions?",
        bestAmount: 4,
        permitted: [gateTypes.and, gateTypes.or, gateTypes.not],
        unlocks: [gateTypes.xor]
    }
];

const chapters = {
    0: "Introduction",
    5: "Gate Combinations",
    8: "The NAND Universality"
};

function getChapter(n) {
    return Object.entries(chapters)
        .map(([k, v]) => [Number(k), v])
        .sort((a, b) => a[0] - b[0])
        .reduce((current, [start, name]) => {
            return n >= start ? name : current;
        }, null);
}

const contextMenu = document.getElementById("context-menu");
const contextMenuRemoveAllWires = document.getElementById("context-menu-remove-all-wires");
const contextMenuRemoveAllWiresSignal = new Signal();
contextMenuRemoveAllWires.addEventListener("click", () => {
    contextMenuRemoveAllWiresSignal.emit();
    contextMenuRemoveAllWiresSignal.disconnectAll();
    contextMenuDeleteSignal.disconnectAll();
    contextMenuSeeDescriptionSignal.disconnectAll();
    contextMenu.classList.remove("visible");
});
const contextMenuDelete = document.getElementById("context-menu-delete");
const contextMenuDeleteSignal = new Signal();
contextMenuDelete.addEventListener("click", () => {
    contextMenuDeleteSignal.emit();
    contextMenuRemoveAllWiresSignal.disconnectAll();
    contextMenuDeleteSignal.disconnectAll();
    contextMenuSeeDescriptionSignal.disconnectAll();
    contextMenu.classList.remove("visible");
});
const contextMenuSeeDescription = document.getElementById("context-menu-see-description");
const contextMenuSeeDescriptionSignal = new Signal();
contextMenuSeeDescription.addEventListener("click", () => {
    contextMenuSeeDescriptionSignal.emit();
    contextMenuRemoveAllWiresSignal.disconnectAll();
    contextMenuDeleteSignal.disconnectAll();
    contextMenuSeeDescriptionSignal.disconnectAll();
    contextMenu.classList.remove("visible");
});

const instructionsWindow = document.getElementById("instructions-window");
const sandboxWindow = document.getElementById("sandbox-window");

const chapterTitle = document.getElementById("chapter-title");

const table = document.getElementById("truth-table");
const levelDescription = document.getElementById("description");
const levelTitle = document.getElementById("level-title");

const hintButton = document.getElementById("hint-button");
const hintContainer = document.getElementById("hint-container");
const hintText = document.getElementById("hint-text");

const tutorialButtons = document.querySelectorAll(".tutorial-button");


// Show the tutorial popup when the tutorial button is clicked
tutorialButtons.forEach(b=>b.addEventListener("click", () => {
    createPopup(`<p style="text-align: center;"><b>How to Play</b></p><ul>
        <li>Logic gates can be added by either clicking them from the bottom toolbar, or by dragging them onto the canvas.</li>
        <li>You can connect logic gates by clicking the orange nodes on either side and dragging it to an opposite node on another gate.</li>
        <li>You can delete logic gates by clicking on them and then pressing the <kbd>Delete</kbd> or <kbd>Backspace</kbd> key on your keyboard, or by dragging it into the bottom toolbar.</li>
        <li>You can reset the level by pressing the <kbd>R</kbd> key or by clicking the reset button.</li>
        <li>You can submit the solution to the level by pressing the <kbd>Enter</kbd> key or by clicking the submit button.</li>
        <li>The truth table can help you visualize desired solutions for each combination of inputs. 0 = OFF, 1 = ON.</li>
        <li>There are many different ways to solve a circuit, so don't stress out over a single one.</li>
        <li>You can click the button on the top-left next to the level and chapter name to view all of the levels. You can also access the sandbox that way, where you can create anything you want using gates you've unlocked.</li></ul>`, "Tutorial", [{
        text: "Ok",
        action: ()=>{}
    }], ()=>{});
}));

// Show a hint under the hint text when the hint button is clicked
hintButton.addEventListener("click", () => {
    hintContainer.classList.toggle("show");
    hintButton.innerHTML = `Click to ${hintContainer.classList.contains("show") ? "hide" : "show"} hint`;
});
hintText.addEventListener("click", () => {
    hintContainer.classList.toggle("show");
    hintButton.innerHTML = `Click to ${hintContainer.classList.contains("show") ? "hide" : "show"} hint`;
});

const levelsButton = document.getElementById("levelsButton");

levelsButton.addEventListener("click", () => {
    let chapterIndex = 0;
    const amountOfLevels = levels.length;
    createPopup(levels.map((level, index) => `${chapters[index] ? `${chapterIndex++ !== 0 ? "</div>" : ""}<div class="chapter-title">${chapters[index]}</div><div class="chapter-container">` : ""}<button class="level-button${level.solved ? " solved" : ""}" onclick="createPopup(\`Are you sure you want to exit the ${sandboxActive ? "sandbox" : "current level"} and go to level ${index + 1}?${sandboxActive ? "" : " This will reset your progress in the current level."}\`, 'Confirmation', [{ text: 'Yes', action: ()=>{closeAllPopups();levelIndex=${index};initLevel(levelIndex);} }, { text: 'No', action: ()=>{} }])"><div class="main">${index + 1}</div><div class="name">${level.name}</div></button>${index === amountOfLevels - 1 ? "</div>" : ""}`).join(" ") + (sandboxActive ? "" : `<button class="sandboxButton" onclick="createPopup(\`Are you sure you want to exit the current level and go to the sandbox? This will reset your progress in the current level.\`, 'Confirmation', [{ text: 'Yes', action: ()=>{closeAllPopups();openSandbox()} }, { text: 'No', action: ()=>{} }])">Go to sandbox</button>`), "Levels");
});

const submitButton = document.getElementById("submitSolutionButton");
const resetButton = document.getElementById("resetButton");
const resetSandboxButton = document.getElementById("resetSandboxButton");

const incorrectSolution = document.getElementById("incorrectSolution");

submitButton.addEventListener("click", submitSolution); // Submit solution when submit button clicked
// Confirmation popup when reset button clicked
resetButton.addEventListener("click", () => createPopup(`<p style="text-align: center;">Are you sure you want to reset the level?</p>`, "Confirmation", [
    {
        text: "Yes",
        action: ()=>initLevel(levelIndex),
        bad: true
    },
    {
        text: "No",
        action: ()=>{}
    }
], ()=>{}));

// Confirmation popup when reset sandbox button clicked
resetSandboxButton.addEventListener("click", () => createPopup(`<p style="text-align: center;">Are you sure you want to reset the sandbox?</p>`, "Confirmation", [
    {
        text: "Yes",
        action: ()=>sandboxGates.forEach(gate => gate.remove()),
        bad: true
    },
    {
        text: "No",
        action: ()=>{}
    }
], ()=>{}));

document.addEventListener("keydown", (e) => {
    if (e.key === "r") {
        // Confirmation popup when reset (r) key pressed
        closeAllPopups();
        if (sandboxActive) {
            createPopup(`<p style="text-align: center;">Are you sure you want to reset the level?</p>`, "Confirmation", [{
                text: "Yes",
                action: ()=>initLevel(levelIndex),
                bad: true
            },
            {
                text: "No",
                action: ()=>{}
            }], ()=>{});
        } else {
            createPopup(`<p style="text-align: center;">Are you sure you want to reset the sandbox?</p>`, "Confirmation", [
                {
                    text: "Yes",
                    action: ()=>sandboxGates.forEach(gate => gate.remove()),
                    bad: true
                },
                {
                    text: "No",
                    action: ()=>{}
                }
            ], ()=>{});
        }
    } else if (e.key === "Enter" && !sandboxActive) {
        // Submit solution when enter key pressed
        submitSolution();
    }
});

let inputGates = [];
let outputGates = [];

let levelIndex = 0;

function humanJoin(arr) {
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;

    return `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
}

function submitSolution() {
    const level = levels[levelIndex];

    let originalPower = [];

    let solutionCorrect = true;
    const tableBody = table.querySelector("tbody");
    
    for (let i = 0; i < level.truth.length; i++) {
        const tableRow = level.truth[i];
        const rowElem = tableBody.children[i];
        for (let j = 0; j < inputGates.length; j++) {
            const inputGate = inputGates[j];
            originalPower.push(inputGate.hasPower);
            inputGate.updatePower([tableRow.input[j] === 1]);
        }
        for (let j = 0; j < outputGates.length; j++) {
            if (outputGates[j].hasPower[0] !== (level.truth[i].output[j] === 1)) {
                solutionCorrect = false;
                rowElem.classList.remove("correct");
                rowElem.classList.add("incorrect");
            } else {
                rowElem.classList.remove("incorrect");
                rowElem.classList.add("correct");
            }
        }
    }
    for (let i = 0; i < inputGates.length; i++) {
        inputGates[i].updatePower(originalPower[i]);
    }
    originalPower = null;
    if (solutionCorrect) {
        const next = () => {
            levels[levelIndex].solved = true;
            unlockedGates.push(...level.unlocks);
            if (level.unlocks.length !== 0) {
                const isPlural = level.unlocks.length !== 1;
                createBannerNotification(`The ${humanJoin(level.unlocks.map((gateType, index) => gateType.name))} ${isPlural ? " gates have" : " gate has"} been added to the sandbox`);
            }
            hintContainer.classList.remove("show");
            hintButton.innerHTML = `Click to show hint`;
            if (levels.length >= ++levelIndex) {
                openSandbox();
                createPopup(`You've completed the last level! We took you to the sandbox, so you can mess around with circuits there. Feel free to retry a level by clicking the level browser in the top-left of the screen.`, "Congratulations!");
                return;
            }
            initLevel(levelIndex);
        };
        const stay = () => {};
        const moreThanBest = gates.length - inputGates.length - outputGates.length - level.bestAmount; // Number of gates used beyond the best solution
        let completionText;
        // Build completion text based on performance
        if (moreThanBest === 0) {
            completionText = `You completed the circuit with 100% perfection!`
        } else {
            completionText = `You used ${moreThanBest} more gate${moreThanBest === 1 ? "" : "s"} than the best solution.`
        }
        // Show level completed popup with completion text
        closeAllPopups();
        createPopup(`<p style="text-align: center;"><b>Level Completed</b></p><p>${completionText}<br>Would you like to try again?</p>`, "Level Completed", [{
            text: "Continue",
            action: next
        },
        {
            text: "Try Again",
            action: stay,
            bad: true
        }], stay);
    } else {
        incorrectSolution.classList.remove("hide");
        setTimeout(() => incorrectSolution.classList.add("hide"), 2000);
    }
}

let sandboxActive = false;

function openSandbox() {
    sandboxActive = true;
    sandboxWindow.classList.remove("hidden");
    instructionsWindow.classList.add("hidden");
    for (let gate of gates) {
        if (!sandboxGates.includes(gate)) {
            gate.remove();
        }
    }
    for (let gate of sandboxGates) {
        gate.show();
    }

    toolbar.innerHTML = "";
    for (let gateType of unlockedGates) {
        const gate = document.createElement("div");
        gate.classList.add("gate");
        gate.setAttribute("data-type", gateType.literalName);
        gate.innerHTML = gateType.name;
        toolbar.appendChild(gate);
    }

    chapterTitle.innerHTML = "Sandbox";
    levelTitle.innerHTML = "";
}

function initLevel(newLevelIndex) {
    sandboxActive = false;
    for (let gate of gates) {
        if (!sandboxGates.includes(gate)) {
            gate.remove();
        }
    }
    for (let gate of sandboxGates) {
        gate.hide();
    }
    sandboxWindow.classList.add("hidden");
    instructionsWindow.classList.remove("hidden");
    const level = levels[newLevelIndex];

    setTimeout(() => hintText.innerHTML = level.hint, 200);

    inputGates = [];
    outputGates = [];

    toolbar.innerHTML = "";
    for (let gateType of level.permitted) {
        const gate = document.createElement("div");
        gate.classList.add("gate");
        gate.setAttribute("data-type", gateType.literalName);
        gate.innerHTML = gateType.name;
        toolbar.appendChild(gate);
    }

    levelDescription.innerHTML = level.description;
    chapterTitle.innerHTML = getChapter(newLevelIndex);
    levelTitle.innerHTML = `Level ${newLevelIndex + 1}: ${level.name}`;

    table.innerHTML = "";

    const inputCount = level.truth[0].input.length;
    const outputCount = level.truth[0].output.length;

    let thead = document.createElement("thead");
    let headerRow = document.createElement("tr");

    for (let i = 0; i < inputCount; i++) {
        const inputLetter = String.fromCharCode(65 + i);
        let th = document.createElement("th");
        th.textContent = inputLetter;
        headerRow.appendChild(th);
        inputGates.push(new Gate("input", 200, 200 + (i * 75), `Input ${inputLetter}`));
    }

    if (outputCount > 1) {
        for (let i = 0; i < outputCount; i++) {
            const outputNumber = i + 1;
            let th = document.createElement("th");
            th.textContent = `O${outputNumber}`;
            headerRow.appendChild(th);
            outputGates.push(new Gate("output", 900, 200 + (i * 75), `Output ${outputNumber}`));
        }
    } else {
        let th = document.createElement("th");
        th.textContent = `Output`;
        headerRow.appendChild(th);
        outputGates.push(new Gate("output", 900, 200));
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    let tbody = document.createElement("tbody");
    level.truth.forEach(row => {
        let tr = document.createElement("tr");

        row.input.forEach(value => {
            let td = document.createElement("td");
            td.textContent = value;
            tr.appendChild(td);
        });
        row.output.forEach(value => {
            let td = document.createElement("td");
            td.textContent = value;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
}

const currentLevelIndex = 0;

let gates = [];
let sandboxGates = [];

document.addEventListener("mousedown", (e) => {
    if (!e.target.closest("#context-menu")) {
        contextMenu.classList.remove("visible");
        contextMenuRemoveAllWiresSignal.disconnectAll();
        contextMenuDeleteSignal.disconnectAll();
        contextMenuSeeDescriptionSignal.disconnectAll();
    }
});

const curveSVG = document.getElementById("curves");

const toolbar = document.getElementById("toolbar");

toolbar.addEventListener("mousedown", (e) => {
    if (!e.target.classList.contains("gate")) return;
    document.addEventListener("mousemove", onToolbarMouseDragStart);
    document.addEventListener("mouseup", onToolbarMouseUp);
});
function onToolbarMouseDragStart(e) {
    const gate = e.target;
    document.removeEventListener("mousemove", onToolbarMouseDragStart);
    document.removeEventListener("mouseup", onToolbarMouseUp);
    let rect = gate.getBoundingClientRect();
    const draggableGate = new Gate(gate.dataset.type, rect.left, rect.top);
    if (sandboxActive) {
        sandboxGates.push(draggableGate);
    }
    let newE = {
        clientX: e.clientX,
        clientY: e.clientY,
        target: draggableGate.element
    };
    draggableGate.onMouseDown(newE);
}
function onToolbarMouseUp(e) {
    document.removeEventListener("mousemove", onToolbarMouseDragStart);
    document.removeEventListener("mouseup", onToolbarMouseUp);
    const gate = new Gate(e.target.dataset.type, 300, 300);
    if (sandboxActive) {
        sandboxGates.push(gate);
    }
}

initLevel(currentLevelIndex);