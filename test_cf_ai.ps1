$headers = @{
    "Authorization" = "Bearer cfat_lDyI7MydRH9DFHJA5ST3ji5eIvAIQlmVLPuaB4l34306eae7"
    "Content-Type"  = "application/json"
}

$body = @{
    model    = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    messages = @(
        @{
            role    = "user"
            content = "Say hello from Cloudflare Workers AI!"
        }
    )
} | ConvertTo-Json -Depth 5

$url = "https://api.cloudflare.com/client/v4/accounts/e94f51b0efd883f9c3b75adba9990061/ai/v1/chat/completions"

Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body