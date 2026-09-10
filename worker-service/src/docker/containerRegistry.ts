interface RoomContainer {
  roomId: string;
  containerId: string;
  containerName: string;
  volumeName: string;
}

const containers =
  new Map<
    string,
    RoomContainer
  >();

export function registerRoomContainer(
  info: RoomContainer
) {
  containers.set(
    info.roomId,
    info
  );
}

export function getRoomContainer(
  roomId: string
) {
  return containers.get(
    roomId
  );
}

export function removeRoomContainer(
  roomId: string
) {
  containers.delete(
    roomId
  );
}