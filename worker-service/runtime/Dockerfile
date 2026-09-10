FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    software-properties-common \
    curl \
    wget \
    ca-certificates \
    git \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    openjdk-17-jdk \
    golang \
    rustc \
    cargo \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# TypeScript execution
RUN npm install -g \
    typescript \
    tsx

WORKDIR /workspace

RUN mkdir -p \
    /workspace/src \
    /workspace/datasets \
    /workspace/documents \
    /workspace/projects \
    /workspace/.codebuddy/temp

ENV PYTHONUNBUFFERED=1
ENV CODEBUDDY_CONTAINER=true
ENV CODEBUDDY_WORKSPACE=/workspace

CMD ["tail", "-f", "/dev/null"]