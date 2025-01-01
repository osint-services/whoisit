import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Card, CardContent, TextField, CircularProgress, Button, Box, List, ListItem, ListItemText, ListItemButton, Typography, Divider } from '@mui/material';
import { PersonSearch } from '@mui/icons-material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

function ResultList(props) {
    const [selectedItem, setSelected] = React.useState(null);
    return (
        <Box sx={{ display: 'flex', flexDirection: 'row' }}>
            <List>
                {props.results.map(result => {
                    return (
                        <ListItem key={result.uri}>
                            <ListItemButton component='a' onClick={async () => {
                                console.log(`focusing on ${result}`);
                                console.log(result.uri);
                                const response = await fetch(`http://127.0.0.1:8000/focus?url=${result.uri}`);
                                const profile = await response.json();
                                setSelected({ 'uri': result.uri, ...profile });
                            }}>
                                <ListItemText
                                    primary={result.title}
                                    secondary={
                                        <Box sx={{ display: 'flex', flexDirection: 'row' }}>
                                            <Box>
                                                <Typography variant='overline' sx={{ fontWeight: 'bold', display: 'block'}} component="span">Category</Typography>
                                                    {result.category}
                                                <Typography variant='overline' sx={{ fontWeight: 'bold', display: 'block'}} component="span">URI</Typography>
                                                    {result.uri}
                                                {'found_timestamp' in result && <Typography variant='overline' sx={{ fontWeight: 'bold', display: 'block'}} component="span">Found</Typography>}
                                                    {'found_timestamp' in result ? result.found_timestamp : null}
                                            </Box>
                                            {selectedItem && selectedItem.uri == result.uri &&
                                                <Card sx={{ marginLeft: '2.5em' }}>
                                                    <CardContent>
                                                        <Typography variant='h5' gutterBottom><u>Username</u></Typography>
                                                        <Typography variant='subtitle1'>{selectedItem.username}</Typography>
                                                        <Typography variant='h5' gutterBottom><u>Website</u></Typography>
                                                        <Typography variant='subtitle1'>{selectedItem.website}</Typography>
                                                        <Typography variant='h5' gutterBottom><u>Tagline</u></Typography>
                                                        <Typography variant='subtitle1'>{selectedItem.tagline}</Typography>
                                                        <Divider/>
                                                        <Typography variant='h6' gutterBottom><u>Bio</u></Typography>
                                                        <Typography variant='body2'>{selectedItem.bio}</Typography>
                                                        <Typography variant='h6' gutterBottom><u>Country</u></Typography>
                                                        <Typography variant="body1">{selectedItem.country}</Typography>
                                                        <Typography variant='h6' gutterBottom><u>Related Links</u></Typography>
                                                        <Typography>{selectedItem.links}</Typography>
                                                    </CardContent>
                                                </Card>}
                                        </Box>
                                    }
                                />
                            </ListItemButton>
                        </ListItem>
                    );
                })}
            </List>
        </Box>
    );
}

const theme = createTheme({
    palette: {
        mode: 'dark'
    }
});

function SearchPage(props) {
    const [username, setUsername] = React.useState('');
    const [searchResults, setSearchResults] = React.useState([]);
    const [searching, setSearching] = React.useState(false);

    const handleSearch = async () => {
        setSearching(true);
        setSearchResults([]);
        props.wsRef.current.send(JSON.stringify({
            'type': 'INIT_SEARCH',
            'username': username
        }));
    };

    React.useEffect(() => {
        if (props.wsRef.current) {
            props.wsRef.current.onmessage = () => {
                if (event.type !== 'message') {
                    console.error(`Invalid event type found. ${event.type}`);
                    return;
                }

                const message = JSON.parse(event.data);
                console.debug('incoming ws message', message)
                switch (message.type) {
                    case 'SEARCH_COMPLETE':
                        setSearchResults(message.data);
                        setSearching(false);
                        break;
                    case 'SEARCH_PROGRESS':
                        setSearchResults(message['sites_matched']);
                        break;
                }
            }
        }
    }, [props.wsRef.current]);

    return (
        <Box>
            <TextField disabled={searching} value={username} label="Username" onChange={e => setUsername(e.target.value)}/>
            {searching ?
                <CircularProgress color='inherit' sx={{ marginLeft: '2em' }}/> :
                <Button startIcon={<PersonSearch/>} onClick={handleSearch}>Scan</Button>}
            <ResultList results={searchResults}/> 
        </Box>
    );
}

function App() {
    const ws = React.useRef(null);
    const [ready, setReady] = React.useState(false);
    
    React.useEffect(() => {
        const socket = new WebSocket('http://127.0.0.1:8001/ws'); 
        socket.onopen = function() {
            const data = JSON.stringify({ 'type': 'CONNECTION_ESTABLISHED' });
            socket.send(data)
        };

        socket.onmessage = function(event) {
            if (event.type !== 'message') {
                console.error(`Invalid event type found. ${event.type}`);
                return;
            }

            const message = JSON.parse(event.data);

            switch (message.type) {
                case 'CONNECTION_ESTABLISHED':
                    setReady(true);
            }
        };

        ws.current = socket;

        return () => {
            socket.close();
        };

    }, []);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline/>
            {ready ?
                <SearchPage wsRef={ws}/> :
                <Box sx={{ display: 'flex', flexDirection: 'row' }}>
                    <Typography variant='h4'>Loading services...</Typography>
                    <CircularProgress color='inherit' sx={{ marginLeft: '2em' }}/>
                </Box>}
        </ThemeProvider>
    )
}

const root = createRoot(document.body);
root.render(<App/>);