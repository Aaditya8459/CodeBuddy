export function validateRoomId(
    roomId: string
): void {
    if (
        !roomId ||
        typeof roomId !== "string"
    ) {
        throw new Error(
            "roomId is required"
        );
    }

    const normalized =
        roomId.trim();

    if (!normalized) {
        throw new Error(
            "roomId cannot be empty"
        );
    }

    if (
        normalized.length > 128
    ) {
        throw new Error(
            "roomId cannot exceed 128 characters"
        );
    }

    if (
        !/^[a-zA-Z0-9_.:-]+$/.test(
            normalized
        )
    ) {
        throw new Error(
            "Invalid roomId. Only letters, numbers, -, _, ., : are allowed."
        );
    }
}