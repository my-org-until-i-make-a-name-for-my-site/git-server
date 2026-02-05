import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './CodespaceEditor.css';

function CodespaceEditor({ user }) {
    const { name } = useParams();
    const navigate = useNavigate();

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }

        if (!name) {
            navigate('/codespaces');
            return;
        }

        // Load the codespace editor iframe
        const iframe = document.getElementById('codespace-iframe');
        if (iframe) {
            // Pass the codespace name to the editor
            iframe.src = `/codespace-editor/?codespace=${encodeURIComponent(name)}`;
        }
    }, [name, user, navigate]);

    return (
        <div className="codespace-editor-container">
            <iframe
                id="codespace-iframe"
                title="Codespace Editor"
                style={{
                    width: '100%',
                    height: '100vh',
                    border: 'none',
                    display: 'block'
                }}
            />
        </div>
    );
}

export default CodespaceEditor;
