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
const ClientMessage = z.union([
    ChatMessage
]);
const ServerMessage = z.union([
    ErrorMessage, JoinMessage, LeaveMessage, UpdateChatMessage
]);

function stamp() {
    return new Date().toISOString();
}

export default class RelayServer {
    constructor(room) {
        this.room = room;
        this.messages = [];
    }
    // when a client sends a message
    onMessage(message, sender) {
        const result = ClientMessage.safeParse(JSON.parse(message));
        if (!result.success) {
            sender.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
            return;
        }
        const data = result.data;
        if (data[0] === 'chat') {
            this.messages.push(data);
            this.syncMessages();
        }
        this.room.broadcast(JSON.stringify(data), [sender.id]);
    }
    onReady() {
        this.syncMessages();
    }
    // when a new client connects
    async onConnect(connection) {
        this.room.broadcast(JSON.stringify({ type: 'join', username: connection.id, timestamp: stamp()}), [connection.id]);
        connection.send(JSON.stringify({ type: 'messages', messages: this.messages }));
    }
    // when a client disconnects
    onClose(connection) {
        this.room.broadcast(JSON.stringify({ type: 'leave', username: connection.id, timestamp: stamp()}), [connection.id]);
    }
    async syncMessages() {
        if (this.room.storage.has('messages')) {
            this.messages = this.room.storage.get('messages');
        }
        this.room.storage.push('messages', this.messages);
    }
}