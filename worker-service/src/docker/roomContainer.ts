import Docker from "dockerode";

const docker = new Docker();

export async function createRoomContainer(
  roomId: string
) {
  const safeRoomId =
    roomId.replace(
      /[^a-zA-Z0-9_-]/g,
      ""
    );

  const containerName =
    `codebuddy-room-${safeRoomId}`;

  const volumeName =
    `codebuddy-room-${safeRoomId}`;

  /*
   * Create persistent Docker volume.
   */
  try {
    await docker.createVolume({
      Name: volumeName,
      Labels: {
        "codebuddy.roomId":
          safeRoomId,
      },
    });
  } catch (error) {
    /*
     * Volume may already exist.
     */
    console.log(
      `Volume ${volumeName} already exists or could not be created.`
    );
  }

  /*
   * Create container.
   */
  const container =
    await docker.createContainer({
      name: containerName,

      Image:
        "codebuddy-runtime:latest",

      WorkingDir:
        "/workspace",

      Cmd: [
        "sh",
        "-c",
        "mkdir -p /workspace && tail -f /dev/null",
      ],

      HostConfig: {
        Binds: [
          `${volumeName}:/workspace`,
        ],
      },

      Labels: {
        "codebuddy.roomId":
          safeRoomId,

        "codebuddy.volume":
          volumeName,
      },
    });

  await container.start();

  return {
    roomId: safeRoomId,
    containerId:
      container.id,
    containerName,
    volumeName,
  };
}