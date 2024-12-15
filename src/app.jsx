import * as React from 'react';
import { createRoot } from 'react-dom/client';

function Search() {
    const [username, setUsername] = React.useState('');
    return (
        <div>
            {/* Scan Input */}
            <label htmlFor="username">Scan:</label>
            <input name="username" value={username} onChange={e => setUsername(e.target.value)}/>

            {/* Get Status */}
            <button onClick={async () => {
                const response = await fetch(`http://0.0.0.0/scan/status/${search}`);
                console.log(await response.json());
            }}>Status</button>

            {/* Start Scan */}
            <button onClick={async () => {
                const response = await fetch(`http://0.0.0.0/scan/${search}`);
                console.log(await response.json());
            }}>Scan</button>
        </div>
    );
}

const root = createRoot(document.body);
root.render(<Search/>);