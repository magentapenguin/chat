import z from "zod";

const ChatMessage = z.object({
    type: z.literal('chat'),
    message: z.string(),
    username: z.string(),
    timestamp: z.date({ coerce: true }),
});

const ErrorMessage = z.object({
    type: z.literal('error'),
    message: z.string(),
    timestamp: z.optional(z.date({ coerce: true })),
});
const JoinMessage = z.object({
    type: z.literal('join'),
    username: z.string(),
    timestamp: z.date({ coerce: true }),
});
const LeaveMessage = z.object({
    type: z.literal('leave'),
    username: z.string(),
    timestamp: z.date({ coerce: true }),
});
const SystemMessage = z.object({
    type: z.literal('system'),
    message: z.any(),
    timestamp: z.date({ coerce: true }),
});
const UpdateChatMessage = z.object({
    type: z.literal('messages'),
    messages: z.array(z.union([JoinMessage, LeaveMessage, ChatMessage])),
});
const ClientMessage = ChatMessage;/*z.union([
    ChatMessage
]);*/
const ServerMessage = z.union([
    ErrorMessage, JoinMessage, LeaveMessage, UpdateChatMessage, ChatMessage, SystemMessage
]);

function stamp() {
    return new Date().toISOString();
}

export default class RelayServer {
    constructor(room) {
        this.room = room;
        this.messages = [];
    }
    commands = {
        "clear": {
            use(server, msg, sender, input) {
                server.messages = [];
                server.syncMessages(true)
                server.room.broadcast(JSON.stringify({ type: 'messages', messages: server.messages }));
                return { type: 'info', message: 'Messages cleared' };
            }, doc: '!clear - Clear all messages'
        },
        "help": {
            use(server, msg, sender, input) {
                if (input.length > 1) {
                    const command = input[1];
                    if (server.commands[command]) {
                        return { type: 'info', message: server.commands[command].doc };
                    } else {
                        return { type: 'error', message: 'Command not found' };
                    }
                }
                return { type: 'info', message: 'Commands: ' + Object.keys(server.commands).map((x)=>'!'+x).join(', ') + '\nUse !help [command] to get help on a command' };
            }, doc: '!help [command] - Get help on a command'
        },
        "list": {
            use(server, msg, sender, input) {
                const formatuser = (user) => {
                    return `<span class="user" data-user="${user}">${user}</span>`;
                }
                let users = [...server.room.getConnections()].map((conn) => conn.id);
                let userlist = users.map(formatuser).join(', ');
                return { type: 'info', message: `Users: ${userlist}` };
            }, doc: '!list - List users in the chat'
        }
    }
    // when a client sends a message
    onMessage(message, sender) {
        const result = ClientMessage.safeParse(JSON.parse(message));
        if (!result.success) {
            console.error(result.error);
            sender.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
            return;
        }
        const data = result.data;
        let preventSend = false;
        if (data.type === 'chat') {
            this.messages.push(data);
            this.syncMessages();
            if (data.message.startsWith('!')) {
                const parts = data.message.split(' ');
                const command = parts[0].substring(1);
                if (this.commands[command]) {
                    preventSend = true;
                    let out;
                    const handle_out = (result) => {
                        console.log('handle', result);
                        if (out.type === 'info') {
                            sender.send(JSON.stringify({ type: 'system', message: result.message, timestamp: stamp() }));
                        }
                        if (out.type === 'error') {
                            sender.send(JSON.stringify({ type: 'error', message: result.message, timestamp: stamp() }));
                        }
                    }
                    try {
                        out = this.commands[command].use(this, message, sender, parts);
                    } catch (err) {
                        console.error(err);
                        sender.send(JSON.stringify({ type: 'error', message: 'An error occurred while processing the command', timestamp: stamp() }));
                        return;
                    }
                    console.log(out);
                    if (out instanceof Promise) {
                        out.then(handle_out).catch((err) => {
                            console.error(err);
                            sender.send(JSON.stringify({ type: 'error', message: 'An error occurred while processing the command', timestamp: stamp() }));
                        });
                    } else {
                        handle_out(out);
                    }
                }
            }
        }
        if (!preventSend) this.room.broadcast(JSON.stringify(data), [sender.id]);
    }
    onReady() {
        this.syncMessages();
    }
    static getCountry(connection) {
        const country = (ctx.request.cf?.country) ?? "unknown";
        return [country];
    }
    // when a new client connects
    async onConnect(connection) {
        const data = { type: 'join', username: connection.id, timestamp: stamp() };
        this.room.broadcast(JSON.stringify(data), [connection.id]);
        this.messages.push(data);
        await this.syncMessages();
        connection.send(JSON.stringify({ type: 'messages', messages: this.messages }));
    }
    // when a client disconnects
    onClose(connection) {
        const data = { type: 'leave', username: connection.id, timestamp: stamp() };
        this.room.broadcast(JSON.stringify(data), [connection.id]);
        this.messages.push(data);
        this.syncMessages();
    }
    async syncMessages(force = false, update = false) {
        if ((!this.messages || this.messages.length <= 0 || update) && !force) {
            this.messages = await this.room.storage.get('messages');
        }
        await this.room.storage.put('messages', this.messages);
    }
}