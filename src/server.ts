import z from "zod";
import type * as Party from "partykit/server";

const ChatMessage = z.object({
    type: z.literal('chat'),
    message: z.string(),
    username: z.string(),
    nickname: z.optional(z.string()),
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
    messages: z.array(z.union([JoinMessage, LeaveMessage, ChatMessage, SystemMessage])),
});
const ClientMessage = ChatMessage;
const ServerMessage = z.union([
    ErrorMessage, JoinMessage, LeaveMessage, UpdateChatMessage, ChatMessage, SystemMessage
]);

function stamp(): string {
    return new Date().toISOString();
}

interface Command {
    use: (server: Server, msg: any, sender: Party.Connection, input: string[]) => CommandOutput | Promise<CommandOutput>;
    doc: string;
}
interface CommandOutput {
    type: 'info' | 'error';
    message: string;
}

export default class Server implements Party.Server {
    messages: any[];
    commands: Record<string, Command>;

    constructor(public room: Party.Room) {
        this.messages = [];
        this.commands = {
            "clear": {
                use: (server, msg, sender, input) => {
                    server.messages = [];
                    server.syncMessages(true);
                    server.room.broadcast(JSON.stringify({ type: 'messages', messages: server.messages }));
                    return { type: 'info', message: 'Messages cleared' };
                },
                doc: '!clear - Clear all messages'
            },
            "help": {
                use: (server, msg, sender, input) => {
                    if (input.length > 1) {
                        const command = input[1];
                        if (server.commands[command]) {
                            return { type: 'info', message: server.commands[command].doc };
                        } else {
                            return { type: 'error', message: 'Command not found' };
                        }
                    }
                    return { type: 'info', message: 'Commands: ' + Object.keys(server.commands).map((x) => '!' + x).join(', ') + '\nUse !help [command] to get help on a command' };
                },
                doc: '!help [command] - Get help on a command'
            },
            "list": {
                use: (server, msg, sender, input) => {
                    const formatuser = (user: string) => {
                        return `<span class="user" data-user="${user}">${user}</span>`;
                    }
                    let users = [...server.room.getConnections()].map((conn) => conn.id);
                    let userlist = users.map(formatuser).join(', ');
                    return { type: 'info', message: `Users: ${userlist}` };
                },
                doc: '!list - List users in the chat'
            },
            "nick": {
                use: (server, msg, sender, input) => {
                    if (input.length < 2) {
                        return { type: 'error', message: 'Usage: !nick [name]' };
                    }
                    const newid = input[1];
                    sender.setState({ nick: newid });
                    return { type: 'info', message: `You are now known as ${newid}` };
                },
                doc: '!nick [name] - Change your username'
            },
        };
    }
    handleCommand(message: string, data: any, sender: Party.Connection) {
        let preventSend = false;
        const parts = data.message.split(' ');
        const command = parts[0].substring(1);
        if (this.commands[command]) {
            preventSend = true;
            let out: CommandOutput | Promise<CommandOutput> | null = null;
            const handle_out = (result: CommandOutput) => {
                console.log('handle', result);
                if (result.type === 'info') {
                    sender.send(JSON.stringify({ type: 'system', message: result.message, timestamp: stamp() }));
                }
                if (result.type === 'error') {
                    sender.send(JSON.stringify({ type: 'error', message: result.message, timestamp: stamp() }));
                }
            }
            try {
                out = this.commands[command].use(this, message, sender, parts);
            } catch (err) {
                console.error(err);
                sender.send(JSON.stringify({ type: 'error', message: 'An error occurred while processing the command', timestamp: stamp() }));
                return preventSend;
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
        } else {
            sender.send(JSON.stringify({ type: 'error', message: 'Command not found', timestamp: stamp() }));
        }
        return preventSend;
    }
    onMessage(message: string, sender: Party.Connection<{ nick?: string }>): void {
        const result = ClientMessage.safeParse(JSON.parse(message));
        if (!result.success) {
            console.error(result.error);
            sender.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
            return;
        }
        const data = result.data;
        data.nickname = sender.state?.nick;
        console.log(data);
        let preventSend = false;
        if (data.type === 'chat') {
            this.messages.push(data);
            this.syncMessages();
            if (data.message.startsWith('!')) {
                preventSend = this.handleCommand(message, data, sender);
            }
        }
        this.room.broadcast(JSON.stringify(data), [sender.id]);
    }

    async onConnect(connection: Party.Connection): Promise<void> {
        const data = { type: 'join', username: connection.id, timestamp: stamp() };
        this.room.broadcast(JSON.stringify(data), [connection.id]);
        this.messages.push(data);
        await this.syncMessages();
        connection.send(JSON.stringify({ type: 'messages', messages: this.messages }));
    }

    onClose(connection: Party.Connection): void {
        const data = { type: 'leave', username: connection.id, timestamp: stamp() };
        this.room.broadcast(JSON.stringify(data), [connection.id]);
        this.messages.push(data);
        this.syncMessages();
    }

    async syncMessages(force: boolean = false, update: boolean = false): Promise<void> {
        if ((!this.messages || this.messages.length <= 0 || update) && !force) {
            this.messages = await this.room.storage.get('messages') ?? [];
        }
        await this.room.storage.put('messages', this.messages);
    }
}
Server satisfies Party.Worker;
