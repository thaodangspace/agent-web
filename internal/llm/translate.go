// Package llm provides local LLM integration (LM Studio).
package llm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// LMStudioClient wraps the LM Studio local OpenAI-compatible API.
type LMStudioClient struct {
	BaseURL string
	Model   string
	Timeout time.Duration
}

// NewLMStudioClient creates a client using LMSTUDIO_URL env var (default http://localhost:1234).
func NewLMStudioClient() *LMStudioClient {
	baseURL := os.Getenv("LMSTUDIO_URL")
	if baseURL == "" {
		baseURL = "http://localhost:1234"
	}
	model := os.Getenv("LMSTUDIO_MODEL")
	if model == "" {
		model = "" // let LM Studio use its loaded model
	}
	return &LMStudioClient{
		BaseURL: baseURL,
		Model:   model,
		Timeout: 60 * time.Second,
	}
}

// Translate translates the given text to the target language using LM Studio.
func (c *LMStudioClient) Translate(text, targetLang string) (string, error) {
	systemPrompt := fmt.Sprintf(
		"You are a professional translator. Translate the following text to %s. "+
			"Preserve all formatting, code blocks, markdown syntax, and structure. "+
			"Only output the translation — do not add explanations or notes.",
		targetLang,
	)

	reqBody := map[string]interface{}{
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": text},
		},
		"temperature": 0.3,
		"max_tokens": 16000,
	}

	if c.Model != "" {
		reqBody["model"] = c.Model
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", c.BaseURL+"/v1/chat/completions", bytes.NewBuffer(jsonBody))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: c.Timeout}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("LM Studio request failed: %w (is LM Studio running at %s?)", err, c.BaseURL)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("LM Studio returned %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no choices in LM Studio response")
	}

	return result.Choices[0].Message.Content, nil
}
