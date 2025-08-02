# Cross-Chain Dutch Auction Backend

## Environment Setup

1. Copy the example environment file to create your own:

```bash
cp .env.example .env
```

2. Edit the `.env` file to set your own values:
   - Set your Supabase connection string
   - Configure your Sepolia RPC URL
   - Set your resolver wallet details
   - Adjust other settings as needed

## Starting the Backend

The backend can be started in several ways using the provided script:

### Start All Services

```bash
./scripts/start.sh all
```

This starts the API server, relayer, and resolver bots together.

### Start Individual Services

```bash
# Start only the API server
./scripts/start.sh api

# Start only the relayer
./scripts/start.sh relayer

# Start only the resolver
./scripts/start.sh resolver
```

### Stop All Services

```bash
./scripts/start.sh stop
```

### Check Service Status

```bash
./scripts/start.sh status
```

## Logs

Logs are stored in the `logs` directory:
- `backend.log` - Combined logs for all services
- `api.log` - API server logs
- `relayer.log` - Relayer service logs
- `resolver.log` - Resolver bot logs

## Database

The backend uses Supabase as its database. Make sure to set the `SUPABASE_CONNECTION_STRING` in your `.env` file:

```
SUPABASE_CONNECTION_STRING=https://your-project-id.supabase.co?key=your-anon-key
```

## Blockchain Configuration

Only Sepolia testnet is supported. Configure your RPC URL in the `.env` file:

```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-api-key
```
