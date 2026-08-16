import Docker from 'dockerode';
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
// Language Configuration Map
const LANGUAGE_CONFIG = {
    python: { image: 'python:3.9-slim', cmd: ['python3', '-c'] },
    javascript: { image: 'node:18-alpine', cmd: ['node', '-e'] },
    cpp: {
        image: 'gcc:11',
        cmd: ['sh', '-c', 'echo "$CODE" > main.cpp && g++ main.cpp -o app && ./app']
    },
    java: {
        image: 'openjdk:11',
        cmd: ['sh', '-c', 'echo "$CODE" > Main.java && javac Main.java && java Main']
    }
};
export async function runCode(code, language) {
    const config = LANGUAGE_CONFIG[language];
    if (!config)
        throw new Error("Unsupported language");
    // Prepare container options
    const container = await docker.createContainer({
        Image: config.image,
        Cmd: config.cmd,
        Env: [`CODE=${code}`], // Pass code as an environment variable
        HostConfig: {
            Memory: 256 * 1024 * 1024, // 256MB limit
            NanoCpus: 500000000, // 0.5 CPU core
        }
    });
    await container.start();
    // Set a timeout of 5 seconds
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Execution timed out')), 5000));
    const execution = new Promise(async (resolve, reject) => {
        try {
            await container.wait();
            const logs = await container.logs({ stdout: true, stderr: true });
            resolve(logs.toString());
        }
        catch (err) {
            reject(err);
        }
        finally {
            await container.remove(); // Always cleanup!
        }
    });
    return Promise.race([execution, timeout]);
}
