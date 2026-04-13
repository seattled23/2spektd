"use strict";
/**
 * Checkpoint system for resuming interrupted builds
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveCheckpoint = saveCheckpoint;
exports.loadCheckpoint = loadCheckpoint;
exports.clearCheckpoint = clearCheckpoint;
exports.getCheckpointStatus = getCheckpointStatus;
var fs_1 = require("fs");
var fs_2 = require("fs");
function saveCheckpoint(checkpoint) {
    var checkpointDir = '.spec2/checkpoints';
    (0, fs_2.mkdirSync)(checkpointDir, { recursive: true });
    var path = "".concat(checkpointDir, "/latest.json");
    (0, fs_1.writeFileSync)(path, JSON.stringify(checkpoint, null, 2), 'utf8');
    console.log("  \uD83D\uDCBE Checkpoint saved: ".concat(checkpoint.phase));
}
function loadCheckpoint() {
    var path = '.spec2/checkpoints/latest.json';
    if (!(0, fs_1.existsSync)(path)) {
        return null;
    }
    try {
        var content = (0, fs_1.readFileSync)(path, 'utf8');
        var checkpoint = JSON.parse(content);
        console.log("\n\uD83D\uDCC2 Found checkpoint from ".concat(checkpoint.timestamp));
        console.log("   Last completed phase: ".concat(checkpoint.phase));
        return checkpoint;
    }
    catch (error) {
        console.warn('⚠️  Failed to load checkpoint, starting fresh');
        return null;
    }
}
function clearCheckpoint() {
    var path = '.spec2/checkpoints/latest.json';
    if ((0, fs_1.existsSync)(path)) {
        // Rename to backup instead of delete
        var backupPath = "".concat(path, ".backup");
        var content = (0, fs_1.readFileSync)(path, 'utf8');
        (0, fs_1.writeFileSync)(backupPath, content, 'utf8');
        console.log("  \uD83D\uDCBE Checkpoint archived to backup");
    }
}
function getCheckpointStatus() {
    var checkpoint = loadCheckpoint();
    if (!checkpoint) {
        return null;
    }
    var phaseNames = {
        wave1: '✓ Wave 1: System Spec',
        wave2: '✓ Wave 2: Subsystem Specs',
        wave3: '✓ Wave 3: Component Specs',
        wave4: '✓ Wave 4: Integration Spec',
        wave5: '✓ Wave 5: Artifacts',
        wave6: '✓ Wave 6: Code Generation',
        complete: '✓ BUILD COMPLETE'
    };
    var completedPhases = [];
    var phases = ['wave1', 'wave2', 'wave3', 'wave4', 'wave5', 'wave6', 'complete'];
    var currentPhaseIndex = phases.indexOf(checkpoint.phase);
    for (var i = 0; i <= currentPhaseIndex && i < phases.length; i++) {
        completedPhases.push(phaseNames[phases[i]]);
    }
    return "\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\n\u2551               Spec2 Project Status                     \u2551\n\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n\nLast checkpoint: ".concat(checkpoint.timestamp, "\nLanguage: ").concat(checkpoint.language, "\n\nCompleted:\n").concat(completedPhases.join('\n'), "\n\n").concat(checkpoint.phase === 'complete' ? '\n✅ Build complete! All phases finished.' : "\n\u23F8\uFE0F  Ready to resume from: ".concat(phaseNames[phases[currentPhaseIndex + 1]] || 'next phase'), "\n");
}
