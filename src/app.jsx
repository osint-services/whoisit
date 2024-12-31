import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, TextField, CircularProgress, Button, Box, List, ListItem, ListItemText, Typography } from '@mui/material';
import { PersonSearch } from '@mui/icons-material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

function ResultList(props) {
    return (
        <List>
            {props.results.map(result => {
                return (
                    <ListItem key={result.uri_check}>
                        <ListItemText
                            primary={result.name}
                            secondary={
                                <React.Fragment>
                                    <Typography variant='overline' sx={{ fontWeight: 'bold', display: 'block'}} component="span">Category</Typography>
                                        {result.cat}
                                    <Typography variant='overline' sx={{ fontWeight: 'bold', display: 'block'}} component="span">URI</Typography>
                                        {result.uri_check}
                                    <Typography variant='overline' sx={{ fontWeight: 'bold', display: 'block'}} component="span">Found</Typography>
                                        {result.found_timestamp}
                                </React.Fragment>
                            }
                        />
                    </ListItem>
                );
            })}
        </List>
    );
}

const theme = createTheme({
    palette: {
        mode: 'dark'
    }
});

function SearchPage() {
    const [username, setUsername] = React.useState('');
    const [searchResults, setSearchResults] = React.useState([]);
    const [searching, setSearching] = React.useState(false);

    const handleSearch = async () => {
        setSearching(true);
        const response = await fetch(`http://0.0.0.0/scan/${username}`);
        const searchResults = await response.json();
        if (response.ok) {
            setSearching(false);
            setSearchResults(searchResults);
        }
    };

    const handleRefresh = async () => {
        const response = await fetch(`http://0.0.0.0/scan/status/${username}`);
        console.log(await response.json());
    };

    return (
        <Box>
            <TextField disabled={searching} value={username} label="Username" onChange={e => setUsername(e.target.value)}/>
            <Button onClick={handleRefresh}>Refresh Results</Button>
            <Button startIcon={<PersonSearch/>} onClick={handleSearch}>Scan</Button>
            {searching &&
                <Alert icon={<CircularProgress color='inherit'/>} severity='success'>
                    Successful seach initiated for {username}
                </Alert>}
            <ResultList results={searchResults}/> 
        </Box>
    );
}

function App() {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline/>
            <SearchPage/>
        </ThemeProvider>
    )
}

const root = createRoot(document.body);
root.render(<App/>);