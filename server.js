// const WebSocket = require("ws");
// const express = require("express");
// const path = require("path")
// var http = require('http');
// const chokidar = require('chokidar');
// const fs = require('fs');

// const app = express()
// var server = http.createServer(app);
// const wss = new WebSocket.Server({server});

// app.use(express.static(path.join(__dirname, "client")));

// wss.on('connection', (ws) => {
//     console.log("Connection Established with a Client")
//     var filename = path.resolve(__dirname, "log.txt");
//     const watcher = chokidar.watch(filename, {
//         persistent: true,
//         usePolling: true,
//         interval: 100
//     });

//     watcher.on('change', (filePath) => {
//         sendFileUpdates(ws, filePath);        
//     });

//     ws.on('close', () => {
//         console.log("A client disconnected");
//         watcher.close();
//     })
// })

// function sendFileUpdates(ws, filePath){
//     fs.readFile(filePath, 'utf8', (err, data) => {
//         if (err) {
//           console.error('Error reading file:', err);
//           return;
//         }
    
//         //send only 10 lines of data
//         const lines = data.trim().split('\n');
//         const last10lines = lines.slice(-10);

//         // Send the log content to all connected clients
//         last10lines.forEach((line) => {
//             const formattedline = line.replace(/\u0000/g, '').trim();
//             ws.send(JSON.stringify({content: formattedline}));
//         });
//       });
// }


// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, "client", "index.html"));
// })

// const PORT = 3000;
// server.listen(PORT, () => {
//     console.log(`Server is running on http://localhost:${PORT}`);
// })



const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const chokidar = require('chokidar');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const filename = path.resolve(__dirname, 'log.txt');
const clients = new Set(); // Track connected clients

// Function to get the last N lines from a file
const getLastNLines = (filePath, n, callback) => {
    var fileSize = fs.statSync(filename).size;
    fileSize = Math.floor(fileSize)
    console.log("filesize id here:", fileSize)
    const stream = fs.createReadStream(filePath, { 
        flag: 'a+',
        encoding: 'UTF-8',
        start: fileSize >= 80 ? fileSize - 80 : 0,
        end: fileSize,
        highWaterMark: 16
     });
    // const stream = fs.createReadStream(filePath, { 
    //     encoding: 'UTF-8',
    // });
    let data = '';
    let lines = [];

    stream.on('data', (chunk) => {
        data += chunk;
        lines = data.split('\n');
        if (lines.length > n) {
            lines = lines.slice(-n);
            data = lines.join('\n\n');
        }
    });

    stream.on('end', () => {
        callback(lines.join('\n\n'));
    });

    stream.on('error', (err) => {
        console.error('Error reading file:', err);
        callback('');
    });
};

// Function to send new lines to all connected clients
const sendNewLines = (filePath, startPosition) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8', start: startPosition });
    let data = '';
    
    stream.on('data', (chunk) => {
        data += chunk;
        const lines = data.split('\n');
        if (lines.length > 1) {
            const newLines = lines.slice(0, -1); // All but the last incomplete line
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    // const formattedline = newLines.replace(/\u0000/g, '').trim();
                    client.send(JSON.stringify({ content: newLines }));
                }
            });
        }
    });

    stream.on('end', () => {
        // Update position for all clients
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.position = startPosition + data.length;
            }
        });
    });

    stream.on('error', (err) => {
        console.error('Error reading file:', err);
    });
};

wss.on('connection', (ws) => {
    console.log('Connection Established with a Client');
    clients.add(ws);

    // Send the last 10 lines to the newly connected client
    getLastNLines(filename, 10, (lastLines) => {
        if (ws.readyState === WebSocket.OPEN) {
            // lastLines.forEach((line) => {
            //     const formattedline = line.replace(/\u0000/g, '').trim();
            //     ws.send(JSON.stringify({content: formattedline}));
            // });
            ws.send(JSON.stringify({ content: lastLines }));
        }
    });

    // Set initial position for the client
    ws.position = fs.existsSync(filename) ? fs.statSync(filename).size : 0;

    // Handle file changes and send new lines to all clients
    const watcher = chokidar.watch(filename, {
        persistent: true,
        usePolling: true,
        interval: 100
    });

    watcher.on('change', () => {
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                sendNewLines(filename, client.position);
            }
        });
    });

    ws.on('close', () => {
        console.log('A client disconnected');
        clients.delete(ws);
        if (clients.size === 0) {
            watcher.close();
        }
    });
});

app.use(express.static(path.join(__dirname, 'client')));

app.get('/log', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
