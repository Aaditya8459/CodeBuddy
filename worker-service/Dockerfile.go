FROM golang:1.22-alpine

WORKDIR /workspace

ENV CGO_ENABLED=0
ENV GO111MODULE=off
ENV GOTOOLCHAIN=local

RUN mkdir -p /workspace

CMD ["go", "version"]