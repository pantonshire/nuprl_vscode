const vscode = acquireVsCodeApi();

const currentProofNode = document.getElementById('current_proof');
const currentProofHysNode = currentProofNode.querySelector('.hypotheses');
const currentProofConclNode = document.getElementById('current_proof_concl');
const currentProofWarningsNode = document.getElementById('current_proof_warnings');

const previousHoleButton = document.getElementById('button_previous_hole');
const nextHoleButton = document.getElementById('button_next_hole');
const numHolesNode = document.getElementById('num_holes');

const subgoalsNode = document.getElementById('current_proof_children');

function clearChildren(node) {
    while (node.lastChild) {
        node.removeChild(node.lastChild);
    }
}

function createHypothesisNode(hy) {
    const visibilityIconNode = document.createElement('vscode-icon');
    visibilityIconNode.classList.add('visibility', 'codicon');
    if (hy.hidden) {
        visibilityIconNode.classList.add('visibility_hidden', 'codicon-eye-closed');
        visibilityIconNode.title = 'This hypothesis is hidden';
    } else {
        visibilityIconNode.classList.add('visibility_visible','codicon-eye');
        visibilityIconNode.title = 'This hypothesis is not hidden';
    }

    const varNode = document.createElement('span');
    varNode.classList.add('variable');
    varNode.innerText = hy.var;

    const separatorNode = document.createElement('span');
    separatorNode.classList.add('membership_separator');
    separatorNode.innerText = '∈';

    const tyNode = document.createElement('span');
    tyNode.classList.add('type');
    tyNode.innerText = hy.ty;

    const hypothesisNode = document.createElement('span');
    hypothesisNode.classList.add('hypothesis');
    hypothesisNode.appendChild(visibilityIconNode);
    hypothesisNode.appendChild(varNode);
    hypothesisNode.appendChild(separatorNode);
    hypothesisNode.appendChild(tyNode);

    return hypothesisNode;
}

function createConclNode(goal, ext) {
    const extNode = document.createElement('span');
    extNode.classList.add('variable');
    if (ext) {
        extNode.innerText = ext;
    } else {
        extNode.innerText = '??';
    }

    const separatorNode = document.createElement('span');
    separatorNode.classList.add('membership_separator');
    separatorNode.innerText = '∈';

    const tyNode = document.createElement('span');
    tyNode.classList.add('type');
    tyNode.innerText = goal;

    const conclNode = document.createElement('span');
    conclNode.classList.add('goal');
    conclNode.appendChild(extNode);
    conclNode.appendChild(separatorNode);
    conclNode.appendChild(tyNode);

    return conclNode;
}

window.addEventListener('message', (event) => {
    const message = event.data;

    if (message.command === 'display_current_proof') {
        clearChildren(currentProofHysNode);
        clearChildren(subgoalsNode);
        clearChildren(currentProofConclNode);
        clearChildren(currentProofWarningsNode);
        numHolesNode.innerText = '';

        const obj = message.obj;
        const proofNode = message.proofNode;

        if (obj && proofNode) {
            if (proofNode.goal) {
                if (proofNode.goal.hys) {
                    proofNode.goal.hys.forEach((hy) => {
                        const hyNode = document.createElement('li');
                        hyNode.appendChild(createHypothesisNode(hy));
                        currentProofHysNode.appendChild(hyNode);
                    });
                }

                const conclNode = createConclNode(proofNode.goal.concl, proofNode.extract);
                currentProofConclNode.appendChild(conclNode);
            }
            
            if (proofNode.children) {
                proofNode.children.forEach((subgoal) => {
                    const subgoalNode = document.createElement('div');
                    subgoalNode.classList.add('proof');
                    if (subgoal.node_id) {
                        const nodeId = subgoal.node_id;
                        subgoalNode.addEventListener('click', (event) => {
                            vscode.postMessage({
                                command: 'jump_to_proof_node',
                                objId: obj.id,
                                nodeId: nodeId
                            });
                        });
                        subgoalNode.classList.add('clickable');
                    }

                    const subgoalHypothesesNode = document.createElement('ol');
                    subgoalHypothesesNode.classList.add('hypotheses');
                    if (subgoal.goal.hys) {
                        subgoal.goal.hys.forEach((hy) => {
                            const hyNode = document.createElement('li');
                            hyNode.appendChild(createHypothesisNode(hy));
                            subgoalHypothesesNode.appendChild(hyNode);
                        });
                    }
                    subgoalNode.appendChild(subgoalHypothesesNode);

                    const subgoalConclusionNode = createConclNode(subgoal.goal.concl, subgoal.extract);
                    subgoalNode.appendChild(subgoalConclusionNode);

                    subgoalsNode.appendChild(subgoalNode);
                });
            }

            if (proofNode.conflict) {
                const conflictWarningNode = document.createElement('p');
                conflictWarningNode.innerText = 'Could not apply inference rule to goal';

                currentProofWarningsNode.appendChild(conflictWarningNode);
            }
        }
    }

    if (message.numHoles !== null) {
        numHolesNode.innerText = 'Holes remaining in file: ' + message.numHoles;
    }
});

previousHoleButton.addEventListener('click', (event) => {
    vscode.postMessage({
        command: 'previous_hole'
    });
});

nextHoleButton.addEventListener('click', (event) => {
    vscode.postMessage({
        command: 'next_hole'
    });
});
