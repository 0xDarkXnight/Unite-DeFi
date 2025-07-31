package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds all configuration for the relayer
type Config struct {
	Database Database
	Ethereum Ethereum
	Sui      Sui
	API      API
	Relayer  Relayer
}

// Database configuration
type Database struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string
}

// Ethereum configuration
type Ethereum struct {
	HTTPUrl                   string
	WSUrl                     string
	PrivateKey                string
	Address                   string // Derived from private key or explicit
	GasLimit                  uint64
	GasPrice                  int64 // in gwei, 0 means use network price
	LimitOrderProtocolAddress string
	EscrowFactoryAddress      string
	ChainID                   int64  // For fork validation
	BlockTime                 int    // Average block time in seconds
	FinalityDepth             uint64 // Blocks to wait for finality
	IsFork                    bool   // Whether this is a fork (Anvil)
	SafetyDepositWei          string // Safety deposit amount in wei
	DefaultForkBlock          uint64 // Default fork block for Anvil
	LogLevel                  string // Log level for this adapter
}

// Sui configuration
type Sui struct {
	RPCUrl           string
	PrivateKey       string
	Address          string // Derived from private key or explicit
	NetworkID        uint64
	GasLimit         uint64
	GasBudget        uint64
	PackageID        string
	CheckpointTime   int    // Average checkpoint time in seconds
	FinalityDepth    uint64 // Checkpoints to wait for finality
	IsLocalValidator bool   // Whether this is a local validator
	DefaultBalance   string // Default balance in SUI units
	LogLevel         string // Log level for this adapter
}

// API configuration
type API struct {
	Port            int
	Host            string
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	ShutdownTimeout time.Duration
}

// Relayer configuration
type Relayer struct {
	MaxConcurrentOrders     int
	OrderTimeout            time.Duration
	PollInterval            time.Duration
	RetryInterval           time.Duration
	MaxRetries              int
	DefaultSrcTimeoutOffset uint64 // Default timeout offset for source chain (seconds)
	DefaultDstTimeoutOffset uint64 // Default timeout offset for destination chain (seconds)
	EventWatcherBufferSize  int    // Buffer size for event channels
	LogLevel                string // Log level (DEBUG, INFO, WARN, ERROR)
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	return &Config{
		Database: Database{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnvInt("DB_PORT", 5432),
			User:     getEnv("DB_USER", "fusion_relayer"),
			Password: getEnvRequired("DB_PASSWORD"),
			DBName:   getEnv("DB_NAME", "fusion_relayer"),
			SSLMode:  getEnv("DB_SSL_MODE", "disable"),
		},
		Ethereum: Ethereum{
			HTTPUrl:                   getEnvRequired("ETH_HTTP_URL"),
			WSUrl:                     getEnvRequired("ETH_WS_URL"),
			PrivateKey:                getEnvRequired("ETH_PRIVATE_KEY"),
			Address:                   getEnv("ETH_ADDRESS", ""), // Auto-derived if empty
			GasLimit:                  getEnvUint64("ETH_GAS_LIMIT", 500000),
			GasPrice:                  getEnvInt64("ETH_GAS_PRICE", 1), // 1 gwei default for forks
			LimitOrderProtocolAddress: getEnvRequired("ETH_LIMIT_ORDER_PROTOCOL_ADDRESS"),
			EscrowFactoryAddress:      getEnvRequired("ETH_ESCROW_FACTORY_ADDRESS"),
			ChainID:                   getEnvInt64("ETH_CHAIN_ID", 1),
			BlockTime:                 getEnvInt("ETH_BLOCK_TIME", 1),        // 1s for Anvil
			FinalityDepth:             getEnvUint64("ETH_FINALITY_DEPTH", 1), // 1 for forks, 6+ for mainnet
			IsFork:                    getEnv("ETH_IS_FORK", "true") == "true",
			SafetyDepositWei:          getEnv("ETH_SAFETY_DEPOSIT_WEI", "1000000000000000"), // 0.001 ETH default
			DefaultForkBlock:          getEnvUint64("ETH_FORK_BLOCK", 19000000),
			LogLevel:                  getEnv("RELAYER_LOG_LEVEL", "INFO"),
		},
		Sui: Sui{
			RPCUrl:           getEnvRequired("SUI_RPC_URL"),
			PrivateKey:       getEnvRequired("SUI_PRIVATE_KEY"),
			Address:          getEnv("SUI_ADDRESS", ""), // Auto-derived if empty
			NetworkID:        getEnvUint64("SUI_NETWORK_ID", 2),
			GasLimit:         getEnvUint64("SUI_GAS_LIMIT", 1000000),
			GasBudget:        getEnvUint64("SUI_GAS_BUDGET", 1000000000),
			PackageID:        getEnvRequired("SUI_PACKAGE_ID"),
			CheckpointTime:   getEnvInt("SUI_CHECKPOINT_TIME", 4),   // 4s for local validator
			FinalityDepth:    getEnvUint64("SUI_FINALITY_DEPTH", 1), // 1 for local, 2+ for testnet
			IsLocalValidator: getEnv("SUI_IS_LOCAL_VALIDATOR", "true") == "true",
			DefaultBalance:   getEnv("SUI_DEFAULT_BALANCE", "1000000000000"), // 1000 SUI
			LogLevel:         getEnv("RELAYER_LOG_LEVEL", "INFO"),
		},
		API: API{
			Port:            getEnvInt("API_PORT", 8080),
			Host:            getEnv("API_HOST", "localhost"),
			ReadTimeout:     getEnvDuration("API_READ_TIMEOUT", 10*time.Second),
			WriteTimeout:    getEnvDuration("API_WRITE_TIMEOUT", 10*time.Second),
			ShutdownTimeout: getEnvDuration("API_SHUTDOWN_TIMEOUT", 5*time.Second),
		},
		Relayer: Relayer{
			MaxConcurrentOrders:     getEnvInt("RELAYER_MAX_CONCURRENT_ORDERS", 100),
			OrderTimeout:            getEnvDuration("RELAYER_ORDER_TIMEOUT", 1*time.Hour),
			PollInterval:            getEnvDuration("RELAYER_POLL_INTERVAL", 5*time.Second),
			RetryInterval:           getEnvDuration("RELAYER_RETRY_INTERVAL", 30*time.Second),
			MaxRetries:              getEnvInt("RELAYER_MAX_RETRIES", 3),
			DefaultSrcTimeoutOffset: getEnvUint64("RELAYER_DEFAULT_SRC_TIMEOUT_OFFSET", 420), // 7 minutes
			DefaultDstTimeoutOffset: getEnvUint64("RELAYER_DEFAULT_DST_TIMEOUT_OFFSET", 180), // 3 minutes
			EventWatcherBufferSize:  getEnvInt("RELAYER_EVENT_WATCHER_BUFFER_SIZE", 100),
			LogLevel:                getEnv("RELAYER_LOG_LEVEL", "INFO"),
		},
	}, nil
}

// Helper functions for environment variable parsing
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvRequired(key string) string {
	value := os.Getenv(key)
	if value == "" {
		panic("Required environment variable " + key + " is not set")
	}
	return value
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			return parsed
		}
	}
	return defaultValue
}

func getEnvInt64(key string, defaultValue int64) int64 {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.ParseInt(value, 10, 64); err == nil {
			return parsed
		}
	}
	return defaultValue
}

func getEnvUint64(key string, defaultValue uint64) uint64 {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.ParseUint(value, 10, 64); err == nil {
			return parsed
		}
	}
	return defaultValue
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if parsed, err := time.ParseDuration(value); err == nil {
			return parsed
		}
	}
	return defaultValue
}
