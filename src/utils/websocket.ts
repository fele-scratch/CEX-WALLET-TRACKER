import WebSocket from 'ws';

export interface LogsNotification {
  result: {
    context: {
      slot: number;
    };
    value: {
      signature: string;
      err: unknown;
      logs: string[];
    };
  };
}

export interface WebSocketConfig {
  endpoint: string;
  mentions: string[];
}

export class WebSocketListener {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private subscriptionId: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 3000;
  private isManualClose = false;

  constructor(config: WebSocketConfig) {
    this.config = config;
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.endpoint);

        this.ws.on('open', () => {
          console.log('[WebSocket] Connected to RPC');
          this.reconnectAttempts = 0;
          this.subscribe();
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error: Error) => {
          console.error('[WebSocket] Error:', error.message);
          reject(error);
        });

        this.ws.on('close', () => {
          console.log('[WebSocket] Connection closed');
          if (!this.isManualClose) {
            this.reconnect();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[WebSocket] Cannot subscribe: connection not ready');
      return;
    }

    const subscription = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        {
          mentions: this.config.mentions,
        },
        {
          commitment: 'confirmed',
        },
      ],
    };

    console.log('[WebSocket] Subscribing to logs with mentions:', this.config.mentions);
    this.ws.send(JSON.stringify(subscription));
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Store subscription ID from response
      if (message.result && !this.subscriptionId) {
        this.subscriptionId = message.result;
        console.log('[WebSocket] Subscription successful, ID:', this.subscriptionId);
        return;
      }

      // Handle log notifications
      if (message.method === 'logsNotification') {
        const notification = message as LogsNotification;
        this.handleLogsNotification(notification);
      }
    } catch (error) {
      console.error('[WebSocket] Error parsing message:', error);
    }
  }

  private handleLogsNotification(notification: LogsNotification): void {
    const { signature, logs } = notification.result.value;
    console.log(`[WebSocket] 📡 New log event - Signature: ${signature}`);
    console.log(`[WebSocket] Logs (${logs.length} entries):`);
    logs.forEach((log) => {
      console.log(`  └─ ${log}`);
    });

    // Emit event for processing
    if (this.onLog) {
      this.onLog(signature, logs);
    }
  }

  public onLog: ((signature: string, logs: string[]) => Promise<void>) | null = null;

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached, giving up');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(
      `[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[WebSocket] Reconnection failed:', error);
      });
    }, delay);
  }

  public close(): void {
    this.isManualClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    console.log('[WebSocket] Connection closed manually');
  }
}
