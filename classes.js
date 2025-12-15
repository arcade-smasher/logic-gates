class GateInterface {
    constructor(name, literalName, description, inputs, outputs, evaluate, extra = {}) {
        this.name = name;
        this.literalName = literalName;
        this.description = description;
        this.inputs = inputs;
        this.outputs = outputs;
        this.evaluate = evaluate;
        this.switchable = extra?.switchable || false;
        this.emits = extra?.emits || false;
        this.startEmitter = extra?.emitter;
    }
}

class Signal {
    constructor() {
        this.listeners = [];
    }

    connect(fn) {
        if (typeof fn === "function") {
            const fnIndex = this.listeners.indexOf(fn);
            let laterFnIndex = this.listeners.length;
            if (fnIndex > -1) {
                console.warn("Cannot connect a function that is already connected.");
            } else {
                this.listeners.push(fn);
                return {
                    before: () => {
                        this.listeners.splice(laterFnIndex, 1);
                        this.listeners.unshift(fn);
                        laterFnIndex = 0;
                    },
                    after: () => {
                        this.listeners.splice(laterFnIndex, 1);
                        this.listeners.push(fn);
                        laterFnIndex = this.listeners.length - 1;
                    }
                };
            }
        }
    }

    disconnect(fn) {
        if (typeof fn === "function") {
            const fnIndex = this.listeners.indexOf(fn);
            if (fnIndex === -1) {
                console.warn("Cannot disconnect a function that is not connected.");
            } else {
                this.listeners.splice(fnIndex, 1);
            }
        }
    }

    disconnectAll() {
        this.listeners = [];
    }

    emit() {
        this.listeners.forEach(fn => fn(...arguments));
    }
}

class Node {
    constructor(gate) {
        this.element = document.createElement("div");
        this.element.classList.add("node");
        this.hasPower = false;
        this.gate = gate;
    }
}

class InputNode extends Node {
    constructor(gate) {
        super(gate);
        this.wire = null;
    }

    power(hasPower) {
        this.hasPower = hasPower;
        if (this.gate) {
            this.gate.updatePower();
        }
    }
}

class OutputNode extends Node {
    constructor(gate) {
        super(gate);
        this.wires = [];
    }

    power(hasPower) {
        this.hasPower = hasPower;
        for (let wire of this.wires) {
            wire.power(hasPower);
        }
    }
}

class Gate {
    constructor(type, x=200, y=200, overrideName=null, UUID=null) {
        this.UUID = UUID || crypto.randomUUID();
        this.element;
        this.rawType = type;
        this.gateType = gateTypes[type.toLowerCase()];
        this.gateText = overrideName || this.gateType.name;
        this.description = this.gateType.description || this.gateType.name;
        if (this.gateType.emits) {
            this.stopEmitter = this.gateType.startEmitter(((value) => {
                this.updatePower(value);
            }).bind(this));
        }
        this.inputNodes = [];
        this.outputNodes = [];
        this.hasPower = new Array(this.gateType.outputs).fill(false);
        this.x = x;
        this.y = y;
        this.removeSignal = new Signal();
        this.moveSignal = new Signal();
        this.powerChangeSignal = new Signal();
        this.#init();
        this.element.addEventListener("contextmenu", ((e) => {
            e.preventDefault();
            contextMenu.classList.add("visible");
            contextMenu.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
            contextMenuRemoveAllWiresSignal.connect((() => {
                for (let node of this.inputNodes) {
                    node?.wire?.remove();
                }
                for (let node of this.outputNodes) {
                    for (let wire of node.wires) {
                        wire.remove();
                    }
                }
            }).bind(this));
            contextMenuDeleteSignal.connect(this.remove.bind(this));
            contextMenuSeeDescriptionSignal.connect((() => createPopup(this.description, "Description")).bind(this));
        }).bind(this));
        gates.push(this);
    }

    #init() {
        this.element = document.createElement("div");
        this.element.classList.add("gate-instance");
        this.element.tabIndex = 0;
        this.element.textContent = this.gateText;
        this.element.style.translate = `${this.x}px ${this.y}px`;

        const gateLeftNodes = document.createElement("div");
        gateLeftNodes.classList.add("nodes-container", "nodes-left-container");

        const gateRightNodes = document.createElement("div");
        gateRightNodes.classList.add("nodes-container", "nodes-right-container");

        this.offsetX = 0;
        this.offsetY = 0;
        this.animationFrame = null;
        this.dragging = false;

        if (this.gateType) {
            for (let i = 0; i < this.gateType.inputs; i++) {
                const node = new InputNode(this);
                gateLeftNodes.appendChild(node.element);
                this.inputNodes.push(node);
            }

            for (let i = 0; i < this.gateType.outputs; i++) {
                const node = new OutputNode(this);
                gateRightNodes.appendChild(node.element);
                this.outputNodes.push(node);
            }
        }

        this.element.appendChild(gateLeftNodes);
        this.element.appendChild(gateRightNodes);
        document.body.appendChild(this.element);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseMoveNode = this.onMouseMoveNode.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onElementKeyDown = this.onElementKeyDown.bind(this);
        this.onDocumentDown = this.onDocumentDown.bind(this);
        this.element.addEventListener("mousedown", this.onMouseDown);
        document.addEventListener("mousedown", this.onDocumentDown);

        this.updatePower();
    }

    onElementKeyDown(e) {
        if ((e.key === "Delete" || e.key === "Backspace") && this.gateType !== gateTypes.input && this.gateType !== gateTypes.output) {
            this.remove();
        }
    }

    onDocumentDown(e) {
        if (e.target !== this.element && e.target.parentElement.parentElement !== this.element) {
            this.element.classList.remove("focus");
        }
    }

    onMouseMove(e) {
        if (this.animationFrame) return;

        this.dragging = true;

        this.x = e.clientX - this.offsetX;
        this.y = e.clientY - this.offsetY;

        this.animationFrame = requestAnimationFrame((() => {
            this.element.style.translate = `${this.x}px ${this.y}px`;
            for (let node of this.inputNodes) {
                if (!node.wire) continue;
                const rect = node.element.getBoundingClientRect();
                node.wire.setEndpoints(node.wire.startX, node.wire.startY, rect.left + rect.width / 2, rect.top + rect.height / 2);
                node.wire.draw();
            }
            for (let node of this.outputNodes) {
                const rect = node.element.getBoundingClientRect();
                for (let wire of node.wires) {
                    wire.setEndpoints(rect.left + rect.width / 2, rect.top + rect.height / 2, wire.endX, wire.endY);
                    wire.draw();
                }
            }
            this.animationFrame = null;
        }).bind(this));
    }

    onMouseUp(e) {
        if (!this.dragging && this.gateType.switchable === true && e?.button === 0) {
            this.updatePower([Math.round(this.hasPower.reduce((a, b) => a + b)) === 0]);
        }
        if (e.clientY > toolbar.getBoundingClientRect().top) {
            this.remove();
        }
        this.dragging = false;
        document.removeEventListener("mousemove", this.onMouseMove);
        document.removeEventListener("mouseup", this.onMouseUp);
    }

    onMouseMoveNode(e, wire) {
        if (this.animationFrame) return;

        this.animationFrame = requestAnimationFrame(() => {
            wire.setEndpoints(wire.startX, wire.startY, e.clientX, e.clientY);
            wire.draw();
            this.animationFrame = null;
        });
    }

    onMouseDown(e) {
        if (e.target === this.element) {
            this.element.classList.add("focus");
            const rect = this.element.getBoundingClientRect();
            this.offsetX = e.clientX - rect.left;
            this.offsetY = e.clientY - rect.top;

            document.addEventListener("mousemove", this.onMouseMove);
            document.addEventListener("mouseup", this.onMouseUp);
            this.element.addEventListener("keydown", this.onElementKeyDown);
        } else if (e.target.classList.contains("node")) {
            const nodeElem = e.target;
            const rect = nodeElem.getBoundingClientRect();
            const inputNode = this.inputNodes.find(node => node.element === nodeElem);
            const inputNodeBoolean = !!inputNode;
            const outputNode = this.outputNodes.find(node => node.element === nodeElem);
            const node = inputNode || outputNode;
            let wire = new Wire(rect.left + rect.width / 2, rect.top + rect.height / 2, e.clientX, e.clientY);
            wire.path.style.pointerEvents = "none";
            wire.hitPath.style.pointerEvents = "none";
            wire.powerPath.style.pointerEvents = "none";
            wire.draw();

            function mouseMoveWrapper(e) {
                this.onMouseMoveNode(e, wire);
            }

            mouseMoveWrapper = mouseMoveWrapper.bind(this);

            function mouseUpWrapper(e) {
                if (e.target.classList.contains("node")) {
                    const endNodeElem = e.target;
                    const endRect = endNodeElem.getBoundingClientRect();
                    const endGate = gates.find(gate => gate.element === endNodeElem.closest(".gate-instance"));
                    const endNode = endGate.inputNodes.find(endNode => endNode.element === endNodeElem) || endGate.outputNodes.find(endNode => endNode.element === endNodeElem);
                    if (node.constructor === endNode.constructor) {
                        wire.remove();
                        wire = null;
                        document.removeEventListener("mousemove", mouseMoveWrapper);
                        document.removeEventListener("mouseup", mouseUpWrapper);
                        return;
                    }
                    if (inputNodeBoolean) {
                        if (node.wire) {
                            wire.remove();
                            wire = null;
                            document.removeEventListener("mousemove", mouseMoveWrapper);
                            document.removeEventListener("mouseup", mouseUpWrapper);
                            return;
                        }
                        node.wire = wire;
                        const index = endNode.wires.length;
                        endNode.wires.push(wire);
                        wire.onRemove.connect(() => {
                            wire = null;
                            node.wire = null;
                            endNode.wires.splice(index, 1);
                        });
                        wire.setEndpoints(endRect.left + endRect.width / 2, endRect.top + endRect.height / 2, wire.startX, wire.startY);
                        wire.connect(endNode, node);
                    } else {
                        if (endNode.wire) {
                            wire.remove();
                            wire = null;
                            document.removeEventListener("mousemove", mouseMoveWrapper);
                            document.removeEventListener("mouseup", mouseUpWrapper);
                            return;
                        }
                        const index = node.wires.length;
                        node.wires.push(wire);
                        endNode.wire = wire;
                        wire.onRemove.connect(() => {
                            wire = null;
                            node.wires.splice(index, 1);
                            endNode.wire = null;
                        });
                        wire.setEndpoints(wire.startX, wire.startY, endRect.left + endRect.width / 2, endRect.top + endRect.height / 2);
                        wire.connect(node, endNode);
                    }
                    wire.endNode.power(wire.hasPower);
                    wire.startCircle.classList.add("curve-node");
                    wire.endCircle.classList.add("curve-node");
                    const removeNoPointerEvents = () => {
                        wire.startCircle.classList.remove("no-pointer-events");
                        wire.endCircle.classList.remove("no-pointer-events");
                        wire.hitPath.classList.remove("no-pointer-events");

                        document.removeEventListener("mouseup", removeNoPointerEvents);
                    };
                    const addNoPointerEvents = (e) => {
                        if (e.target === wire.startCircle) {
                            if (wire.startNode && wire.startNode.gate) {
                                wire.startNode.gate.onMouseDown({
                                    clientX: e.clientX,
                                    clientY: e.clientY,
                                    target: wire.startNode.element
                                });
                            }
                            wire.endCircle.classList.add("no-pointer-events");
                            wire.hitPath.classList.add("no-pointer-events");
                        } else if (e.target === wire.endCircle) {
                            if (wire.endNode && wire.endNode.gate) {
                                wire.endNode.gate.onMouseDown({
                                    clientX: e.clientX,
                                    clientY: e.clientY,
                                    target: wire.endNode.element
                                });
                            }
                            wire.startCircle.classList.add("no-pointer-events");
                            wire.hitPath.classList.add("no-pointer-events");
                        } else if (e.target === wire.hitPath) {
                            wire.startCircle.classList.add("no-pointer-events");
                            wire.endCircle.classList.add("no-pointer-events");
                        } else {
                            wire.startCircle.classList.add("no-pointer-events");
                            wire.endCircle.classList.add("no-pointer-events");
                            wire.hitPath.classList.add("no-pointer-events");
                        }
                        document.addEventListener("mouseup", removeNoPointerEvents);
                    };
                    wire.onRemove.connect(() => {
                        document.removeEventListener("mousedown", addNoPointerEvents);
                        document.removeEventListener("mouseup", removeNoPointerEvents);
                    });
                    document.addEventListener("mousedown", addNoPointerEvents);
                    // if (willNodeShortCircuit(wire.startNode)) {
                    //     wire.remove();
                    //     return;
                    // }
                    wire.endNode.power(wire.endNode.hasPower);
                    wire.draw();
                    let dashInterval;
                    let dashOffset = 0;
                    let dashPowerOffset = 12;

                    wire.hitPath.style.removeProperty("pointer-events");

                    clearEffects();
                    if (wire.hasPower && !dashInterval) {
                        wire.powerPath.removeAttribute("style");
                        startDashAnimation();
                    }

                    wire.onPowerChange.connect((power) => {
                        clearEffects();
                        if (!power || dashInterval) return;

                        wire.powerPath.removeAttribute("style");
                        startDashAnimation();
                    });

                    function startDashAnimation() {
                        updateDashOffset(dashPowerOffset);
                        dashInterval = setInterval(() => {
                            dashPowerOffset = (dashPowerOffset - 3 + 12) % 12;
                            updateDashOffset(dashPowerOffset);
                        }, 50);

                        wire.path.setAttribute("stroke-dasharray", "4, 8");
                        wire.powerPath.setAttribute("stroke-dasharray", "8, 4");
                    }

                    function updateDashOffset(offset) {
                        wire.path.setAttribute("stroke-dashoffset", offset.toString());
                        wire.powerPath.setAttribute("stroke-dashoffset", (offset + 8).toString());
                    }
                    wire.onRemove.connect(clearEffects).before();
                    function clearEffects() {
                        clearInterval(dashInterval);
                        dashInterval = null;

                        ["stroke-dashoffset", "stroke-dasharray"].forEach(attr => {
                            wire.path.removeAttribute(attr);
                            wire.powerPath.removeAttribute(attr);
                        });

                        wire.powerPath.style.display = "none";
                    }

                    wire.hitPath.addEventListener("mouseover", () => {
                        clearEffects();

                        dashInterval = setInterval(() => {
                            dashOffset += 0.2;
                            const offset = 8 * Math.sin(dashOffset) + dashPowerOffset;
                            updateDashOffset(offset);
                        }, 50);

                        wire.path.setAttribute("stroke-dasharray", "8, 4");
                    });

                    wire.hitPath.addEventListener("mouseout", () => {
                        clearEffects();
                        if (!wire.hasPower || dashInterval) return;

                        wire.powerPath.removeAttribute("style");
                        startDashAnimation();
                    });

                    wire.hitPath.addEventListener("click", () => {
                        clearEffects();
                        wire.remove();
                    });
                } else {
                    wire.remove();
                    wire = null;
                }
                document.removeEventListener("mousemove", mouseMoveWrapper);
                document.removeEventListener("mouseup", mouseUpWrapper);
            }

            mouseUpWrapper = mouseUpWrapper.bind(this);

            document.addEventListener("mousemove", mouseMoveWrapper);
            document.addEventListener("mouseup", mouseUpWrapper);
            return {
                mouseMoveWrapper: mouseMoveWrapper,
                mouseUpWrapper: mouseUpWrapper
            };
        }
    }

    updatePower(hasPower=[false]) {
        if (this.gateType.switchable === true || this.gateType.emits === true) {
            this.hasPower = this.gateType.evaluate(this.inputNodes.map(node => node.hasPower), hasPower);
            for (let i = 0; i < this.gateType.outputs; i++) {
                this.outputNodes[i].power(this.hasPower[i]);
            }
            this.element.classList.toggle("powered", Math.round(this.hasPower.reduce((a, b) => a + b)) === 1);
        } else {
            this.hasPower = this.gateType.evaluate(this.inputNodes.map(node => node.hasPower));
            for (let i = 0; i < this.gateType.outputs; i++) {
                this.outputNodes[i].power(this.hasPower[i]);
            }
            this.element.classList.toggle("powered", Math.round(this.hasPower.reduce((a, b) => a + b)) === 1);
        }
    }

    remove() {
        if (this.gateType.emits) {
            this.stopEmitter();
        }
        this.element.classList.add("deleted")
        this.removeSignal.disconnectAll();
        this.moveSignal.disconnectAll();
        this.powerChangeSignal.disconnectAll();
        for (let node of this.inputNodes) {
            node?.wire?.remove();
        }
        for (let node of this.outputNodes) {
            for (let wire of node.wires) {
                wire.remove();
            }
        }
        gates = gates.filter(gate => gate !== this);
        setTimeout(() => {
            this.element.remove();
        }, 200);
    }

    hide() {
        this.element.classList.add("hidden");
        for (let node of this.outputNodes) {
            for (let wire of node.wires) {
                wire.hide();
            }
        }
    }

    show() {
        this.element.classList.remove("hidden");
        for (let node of this.outputNodes) {
            for (let wire of node.wires) {
                wire.show();
            }
        }
    }
}

class Wire {
    constructor(startX, startY, endX, endY) {
        this.startX = startX;
        this.startY = startY;
        this.endX = endX;
        this.endY = endY;

        this.onPowerChange = new Signal();
        this.onRemove = new Signal();
        this.hasPower = false;

        this.controlX1 = (startX + endX) / 2;
        this.controlY1 = startY;
        this.controlX2 = (startX + endX) / 2;
        this.controlY2 = endY;

        this.path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.path.setAttribute("stroke", "var(--node-color)");
        this.path.setAttribute("fill", "transparent");
        this.path.setAttribute("stroke-width", "2");
        curveSVG.appendChild(this.path);

        this.powerPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.powerPath.setAttribute("stroke", "var(--node-hover-color)");
        this.powerPath.setAttribute("fill", "transparent");
        this.powerPath.setAttribute("stroke-width", "2");
        curveSVG.appendChild(this.powerPath);

        this.hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.hitPath.setAttribute("stroke", "transparent");
        this.hitPath.setAttribute("fill", "none");
        this.hitPath.setAttribute("stroke-width", "10");
        this.hitPath.classList.add("hit");
        curveSVG.appendChild(this.hitPath);

        this.startCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        this.startCircle.setAttribute("cx", this.startX);
        this.startCircle.setAttribute("cy", this.startY);
        this.startCircle.setAttribute("r", 5);
        this.startCircle.setAttribute("fill", "transparent");
        curveSVG.appendChild(this.startCircle);

        this.endCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        this.endCircle.setAttribute("cx", this.endX);
        this.endCircle.setAttribute("cy", this.endY);
        this.endCircle.setAttribute("r", 5);
        this.endCircle.setAttribute("fill", "transparent");
        curveSVG.appendChild(this.endCircle);
    }

    setEndpoints(startX, startY, endX, endY) {
        this.startX = startX;
        this.startY = startY;
        this.endX = endX;
        this.endY = endY;

        this.controlX1 = (startX + endX) / 2;
        this.controlY1 = startY;
        this.controlX2 = (startX + endX) / 2;
        this.controlY2 = endY;
    }

    draw() {
        const d = `M ${this.startX} ${this.startY}
                   C ${this.controlX1} ${this.controlY1},
                     ${this.controlX2} ${this.controlY2},
                     ${this.endX} ${this.endY}`;

        this.startCircle.setAttribute("cx", this.startX);
        this.startCircle.setAttribute("cy", this.startY);
        this.endCircle.setAttribute("cx", this.endX);
        this.endCircle.setAttribute("cy", this.endY);

        if (this.hasPower) {
            this.powerPath.setAttribute("d", d);
            this.powerPath.removeAttribute("style");
        } else {
            this.powerPath.style.display = "none";
        }
        this.path.setAttribute("d", d);
        this.hitPath.setAttribute("d", d);
    }

    power(hasPower) {
        if (this.hasPower === hasPower) return;
        this.hasPower = hasPower;
        this.draw();
        this.endNode.power(hasPower);
        this.onPowerChange.emit(hasPower);
    }

    connect(startNode, endNode) {
        this.startNode = startNode;
        this.endNode = endNode;
        this.hasPower = startNode.hasPower;
    }

    remove() {
        this.onRemove.emit();
        if (this.endNode) {
            this.endNode.power(false);
            this.endNode.wire = null;
        }
        if (this.startNode) {
            this.startNode.wires = this.startNode.wires.filter(wire => wire !== this);
        }
        this.path.remove();
        this.hitPath.remove();
        this.powerPath.remove();
        this.startCircle.remove();
        this.endCircle.remove();
        this.onRemove.disconnectAll();
        this.onRemove = null;
        this.onPowerChange.disconnectAll();
        this.onPowerChange = null;
    }

    hide() {
        this.path.classList.add("hidden");
        this.hitPath.classList.add("hidden");
        this.powerPath.classList.add("hidden");
        this.startCircle.classList.add("hidden");
        this.endCircle.classList.add("hidden");
    }

    show() {
        this.path.classList.remove("hidden");
        this.hitPath.classList.remove("hidden");
        this.powerPath.classList.remove("hidden");
        this.startCircle.classList.remove("hidden");
        this.endCircle.classList.remove("hidden");
    }
}