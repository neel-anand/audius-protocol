FROM golang:alpine AS builder

RUN apk add build-base make ffmpeg

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod graph | awk '{if ($1 !~ "@") print $2}' | xargs go get

COPY . .
RUN go build
RUN go build -o mediorum-cmd cmd/main.go

FROM alpine AS final

RUN apk add curl ffmpeg

COPY --from=builder /go/bin/* /bin
COPY --from=builder /app/mediorum /bin/mediorum
COPY --from=builder /app/mediorum-cmd /bin/mediorum-cmd

VOLUME ["/mediorum_data"]
EXPOSE 1991
ENTRYPOINT ["mediorum"]
