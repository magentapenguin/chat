import { customAlphabet, random } from 'nanoid';
import PartySocket from "partysocket";
import dompurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import './constat.js';
import z from "zod";

document.getElementById('localstorage-consent-button').addEventListener('click', () => {
    localStorage.setItem('consent', 'true');
    document.getElementById('localstorage-consent').remove();
});
if (localStorage.getItem('consent')) {
    document.getElementById('localstorage-consent').remove();
}
const ChatMessage = z.object({
    type: z.literal('chat'),
    message: z.string(),
    username: z.string(),
    timestamp: z.date({coerce: true}),
});

const ErrorMessage = z.object({
    type: z.literal('error'),
    message: z.string(),
    timestamp: z.optional(z.date({coerce: true})),
});
const JoinMessage = z.object({
    type: z.literal('join'),
    username: z.string(),
    timestamp: z.date({coerce: true}),
});
const LeaveMessage = z.object({
    type: z.literal('leave'),
    username: z.string(),
    timestamp: z.date({coerce: true}),
});
const SystemMessage = z.object({
    type: z.literal('system'),
    message: z.any(),
    timestamp: z.date({coerce: true}),
});
const UpdateChatMessage = z.object({
    type: z.literal('messages'),
    messages: z.array(z.union([JoinMessage, LeaveMessage, ChatMessage])),
});
const ServerMessage = z.union([
    ErrorMessage, JoinMessage, LeaveMessage, UpdateChatMessage, ChatMessage, SystemMessage
]);

const tips = [
    "Use /move to change rooms",
    "Use /help for info on commands",
    "Use /list to list all users",
];
let tipsIndex = random(0, tips.length - 1);
const chatTip = document.getElementById('chat-tip');
chatTip.textContent = tips[tipsIndex];
document.getElementById('chat-tip-next').addEventListener('click', () => {
    tipsIndex = (tipsIndex + 1) % tips.length;
    chatTip.animate([
        { opacity: 1 },
        { opacity: 0 },
    ], {
        duration: 200,
        fill: 'forwards',
    }).onfinish = () => {
        chatTip.textContent = tips[tipsIndex];
        chatTip.animate([
            { opacity: 0 },
            { opacity: 1 },
        ], {
            duration: 200,
            fill: 'forwards',
        });
    };
});


// https://stackoverflow.com/a/52171480
const cyrb53 = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for(let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

function stamp() {
    return new Date().toISOString();
}
function humanize(date) {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    return date.toLocaleDateString()+' '+date.toLocaleTimeString();
}

function timestamp2html(timestamp) {
    return `<time datetime="${timestamp}">${humanize(timestamp)}</time>`;
}

function usernameColor(username, seed = 0) {
    const hue = cyrb53(username, seed) % 360
    return `hsl(${hue}, 50%, 50%)`;
}
const alphabet = '6789BCDFGHJKLMNPQRTWbcdfghjkmnpqrtwz';
const nanoid = customAlphabet(alphabet, 8);
const md = new MarkdownIt();

var room = localStorage.getItem('room');
if (!room) {
    room = 'chat';
    localStorage.setItem('room', room);
}

const socket = new PartySocket({
    host: location.host,
    room: room,
    id: nanoid()
});
document.querySelector('connection-status').link(socket);

const log_message = (msg) => {
    const el = document.createElement('div');
    msg = Object.assign(msg, { message: dompurify.sanitize(md.renderInline(msg.message)) });  
    msg = `${timestamp2html(msg.timestamp)} - <span class="user" data-user="${msg.username}">${msg.username}</span>: ${msg.message}`;
    el.innerHTML = msg;
    el.className = 'message';
    chat.appendChild(el);
    return el;
}
const sys_message = (msg, extraclasses) => {
    const el = document.createElement('div');
    el.innerHTML = dompurify.sanitize(msg);
    el.className = 'message system'+(extraclasses ? ' '+extraclasses : '');
    chat.appendChild(el);
    return el;
}


const chat = document.getElementById('chat');
const form = document.getElementById('chat-form');

form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input');
    let msg = { type: 'chat', message: input.value, username: socket.id, timestamp: stamp() };
    log_message(msg).scrollIntoView();
    if (input.value.startsWith('/')) {
        const parts = input.value.split(' ');
        switch (parts[0]) {
            case '/move':
                if (parts.length === 2) {
                    const room = parts[1];
                    socket.updateProperties({ room });
                    localStorage.setItem('room', room);
                    document.getElementById('chat-room').textContent = 'Loading...';
                    document.getElementById('chat-room').style.color = 'unset';
                    socket.reconnect();
                    input.value = '';
                    return;
                }
            case '/help':
                sys_message(`${timestamp2html(stamp())} - <span class="user">CLIENT</span>: Commands: /move, /help`);
        }
    }
    input.value = '';
    socket.send(JSON.stringify(msg));
});

socket.addEventListener('open', () => {
    const chatId = document.getElementById('chat-id');
    chatId.textContent = socket.id;
    chatId.style.color = usernameColor(socket.id);
    const chatRoom = document.getElementById('chat-room');
    chatRoom.textContent = socket.room;
    chatRoom.style.color = usernameColor(socket.room, 7);

    console.log('Connected to chat server');
});

socket.addEventListener('message', (message) => {
    console.log('Received message:', message.data);
    const result = ServerMessage.safeParse(JSON.parse(message.data));
    if (!result.success) {
        console.error('Invalid message:', message.data);
        return;
    }
    const handleMessage = (msg) => {
        const { type, ...data } = msg;
        if (type === 'chat') {
            log_message(data);
        }
        if (type === 'error') {
            sys_message(`${timestamp2html(data.timestamp)} - ${data.message}`, 'error');
        }
        if (type === 'join') {
            sys_message(`${timestamp2html(data.timestamp)} - <span class="user" data-user="${data.username}">${data.username}</span> joined the chat`);
        }
        if (type === 'leave') {
            sys_message(`${timestamp2html(data.timestamp)} - <span class="user" data-user="${data.username}">${data.username}</span> left the chat`);
        }
        if (type === 'system') {
            sys_message(`${timestamp2html(data.timestamp)} - <span class="user">SYSTEM</span>: ${data.message}`);
        }
        if (type === 'messages') {
            chat.innerHTML = '';
            for (const msg of data.messages) {
                handleMessage(msg);
            }
        }
    }
    handleMessage(result.data);
});

// username colors
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.classList.contains('user') && node.dataset.user) {
                    node.style.color = usernameColor(node.dataset.user);
                }
                node.querySelectorAll('[data-user].user').forEach(user => {
                    if (user) {
                        // set color based on username hash
                        user.style.color = usernameColor(user.dataset.user);
                    }
                });                
            }
        }
    }
});
observer.observe(chat, { childList: true, subtree: true });