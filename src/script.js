import { customAlphabet } from 'nanoid';
import PartySocket from "partysocket";
import dompurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import './constat.js';
import z from "zod";

const ChatMessage = z.object({
    type: z.literal('chat'),
    message: z.string(),
    username: z.string(),
    timestamp: z.date(),
});

const UpdateChatMessage = z.object({
    type: z.literal('messages'),
    messages: z.array(ChatMessage),
});

const ErrorMessage = z.object({
    type: z.literal('error'),
    message: z.string(),
});
const JoinMessage = z.object({
    type: z.literal('join'),
    username: z.string(),
    timestamp: z.date(),
});
const LeaveMessage = z.object({
    type: z.literal('leave'),
    username: z.string(),
    timestamp: z.date(),
});
const ServerMessage = z.union([
    ErrorMessage, JoinMessage, LeaveMessage, UpdateChatMessage
]);

function stamp() {
    return new Date().toISOString();
}
function humanize(date) {
    return date.toLocaleTimeString();
}

const alphabet = '6789BCDFGHJKLMNPQRTWbcdfghjkmnpqrtwz';
const nanoid = customAlphabet(alphabet, 8);
const md = new MarkdownIt();

const socket = new PartySocket({
    host: location.host,
    room: 'chat',
    id: nanoid()
});
document.querySelector('connection-status').link(socket);

const log_message = (msg, sender) => {
    const el = document.createElement('div');
    msg = `**${sender}**: ${msg}`;
    el.innerHTML = dompurify.sanitize(md.render(msg));
    el.className = 'message';
    chat.appendChild(el);
}


const chat = document.getElementById('chat');
const form = document.getElementById('chat-form');

form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input');
    let msg = input.value;
    socket.send(JSON.stringify({ type: 'chat', message: msg, username: socket.id }));
    input.value = '';
    log_message(msg, socket.id+' (you)');
});

socket.addEventListener('open', () => {
    document.getElementById('chat-id').textContent = socket.id;
    console.log('Connected to chat server');
});

socket.addEventListener('message', (message) => {
    console.log('Received message:', message.data);
    const result = ServerMessage.safeParse(JSON.parse(message.data));
    if (!result.success) {
        console.error('Invalid message:', message.data);
        return;
    }
    const { type, ...data } = result.data;

    if (type === 'chat') {
        log_message(data.message, data.username);
    }
});