'use client';

interface AnalysisSessionType {
    id: number;
    started_at: string;
    total_images: number;
    custom_name?: string | null;
    channel_title?: string | null;
    channel_username?: string | null;
    branch_name?: string | null;
}

export interface BranchType {
    id: number;
    name: string;
    created_at: string;
}

interface AnalysisControlsProps {
    useOcr: boolean;
    setUseOcr: (v: boolean) => void;
    useAi: boolean;
    setUseAi: (v: boolean) => void;
    aiModel: string;
    setAiModel: (v: string) => void;

    branches: BranchType[];
    selectedBranchId: string;
    setSelectedBranchId: (v: string) => void;
    newBranchName: string;
    setNewBranchName: (v: string) => void;

    sessions: AnalysisSessionType[];
    selectedSessionId: string;
    setSelectedSessionId: (v: string) => void;
    customName: string;
    setCustomName: (v: string) => void;
    onStartAnalysis: () => void;
    isAnalyzing: boolean;
}

export default function AnalysisControls({
    useOcr, setUseOcr, useAi, setUseAi, aiModel, setAiModel,
    branches, selectedBranchId, setSelectedBranchId, newBranchName, setNewBranchName,
    sessions, selectedSessionId, setSelectedSessionId, customName, setCustomName, onStartAnalysis, isAnalyzing
}: AnalysisControlsProps) {
    return (
        <div className="analysis-controls">
            <div className="control-group">
                <label className="toggle-label">
                    <input
                        type="checkbox"
                        checked={useOcr}
                        onChange={(e) => setUseOcr(e.target.checked)}
                        disabled={isAnalyzing}
                    />
                    <span className="toggle-switch"></span>
                    <span>Use OCR Analysis</span>
                </label>
            </div>

            <div className="control-group">
                <label className="toggle-label">
                    <input
                        type="checkbox"
                        checked={useAi}
                        onChange={(e) => setUseAi(e.target.checked)}
                        disabled={isAnalyzing}
                    />
                    <span className="toggle-switch"></span>
                    <span>Use AI Analysis</span>
                </label>
            </div>

            {useAi && (
                <div className="control-group">
                    <label>AI Model:</label>
                    <select
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        disabled={isAnalyzing}
                        className="model-select"
                    >
                        <option value="gemini">🔮 Gemini</option>
                        <option value="chatgpt">💬 ChatGPT</option>
                    </select>
                </div>
            )}

            <div className="control-group session-select-group">
                <label>Company Branch:</label>
                <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    disabled={isAnalyzing}
                    className="model-select session-select"
                >
                    <option value="new">➕ Create New Branch</option>
                    {branches.map(b => (
                        <option key={b.id} value={b.id.toString()}>
                            🏢 {b.name}
                        </option>
                    ))}
                </select>

                {selectedBranchId === 'new' && (
                    <div style={{ marginTop: '10px' }}>
                        <label>New Branch Name:</label>
                        <input
                            type="text"
                            value={newBranchName}
                            onChange={(e) => setNewBranchName(e.target.value)}
                            placeholder="e.g. North Area"
                            className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-1 mt-1 block w-full outline-none focus:border-blue-500"
                        />
                    </div>
                )}
            </div>

            <div className="control-group session-select-group">
                <label>Target Session:</label>
                <select
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    disabled={isAnalyzing}
                    className="model-select session-select"
                >
                    <option value="new">➕ Create New Session</option>
                    {sessions.map(s => {
                        const displayName = s.custom_name ? s.custom_name : `#${s.id} (${new Date(s.started_at).toLocaleDateString()})`;
                        return (
                            <option key={s.id} value={s.id.toString()}>
                                Append to {displayName} - {s.total_images} imgs
                            </option>
                        );
                    })}
                </select>

                {selectedSessionId === 'new' && (
                    <div style={{ marginTop: '10px' }}>
                        <label>Session Name (Optional):</label>
                        <input
                            type="text"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            placeholder="e.g. March Analysis"
                            className="bg-gray-800 text-white border border-gray-600 rounded px-3 py-1 mt-1 block w-full outline-none focus:border-blue-500"
                        />
                    </div>
                )}
            </div>

            <button
                className="btn btn-primary btn-analyze"
                onClick={onStartAnalysis}
                disabled={isAnalyzing}
            >
                {isAnalyzing ? '🔄 Analyzing...' : '🚀 Start Analysis'}
            </button>
        </div>
    );
}
