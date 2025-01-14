package config

var (

	// Rate limit config
	RateLimitRulesBucketName            = "rateLimitRules"
	RateLimitTimeframeHours             = "timeframeHours"
	RateLimitMaxNumMessages             = "maxNumMessages"
	RateLimitMaxNumMessagesPerRecipient = "maxNumMessagesPerRecipient"
	RateLimitMaxNumNewChats             = "maxNumNewChats"

	DefaultRateLimitRules = map[string]int{
		RateLimitTimeframeHours:             24,
		RateLimitMaxNumMessages:             2000,
		RateLimitMaxNumMessagesPerRecipient: 1000,
		RateLimitMaxNumNewChats:             100,
	}
)
