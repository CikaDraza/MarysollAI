# Agent model A/B eval

Datum: 2026-06-13T13:09:46.110Z
Scenarija: 20

| Model | Provider | JSON valid | Intent | Handoff | Entity | Halucinacije | p50 ms | p95 ms | Tokeni (in/out) | Cena |
|---|---|---|---|---|---|---|---|---|---|---|
| deepseek-chat | deepseek | 100% | 100% | 95% | 100% | 0% | 1740 | 2345 | 11973/2250 | $0.0018 |
| claude-sonnet-4-6 | anthropic | 100% | 100% | 100% | 100% | 0% | 2881 | 4357 | 12803/2594 | $0.0773 |
| gpt-5.5 | openai | 100% | 95% | 95% | 100% | 0% | 3253 | 5400 | 10997/2813 | n/a |

Kriterijumi: razume booking intent (Intent), drži kontekst (multi-turn slučajevi), prati JSON contract (JSON valid), ne halucinira (Halucinacije — niže je bolje).

