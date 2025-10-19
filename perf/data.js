window.BENCHMARK_DATA = {
  "lastUpdate": 1760900341711,
  "repoUrl": "https://github.com/Teagan42/Eddie",
  "entries": {
    "Eddie performance benchmarks": [
      {
        "commit": {
          "author": {
            "email": "that@teagantotally.rocks",
            "name": "Teagan Glenn",
            "username": "Teagan42"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "656554e33bdf4e34556d5cb3158e00e662c47978",
          "message": "refactor(chat-page): centralize displayed session removal (#635)",
          "timestamp": "2025-10-19T11:30:37-06:00",
          "tree_id": "753f3e64db60143e1e9ec09ed0cd3b8d6db42b3f",
          "url": "https://github.com/Teagan42/Eddie/commit/656554e33bdf4e34556d5cb3158e00e662c47978"
        },
        "date": 1760895686407,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "OpenAIAdapter.stream recorded scenarios › Heavy tool-call loop (cold + warm)",
            "value": 47.296,
            "unit": "ms",
            "extra": "[object Object]"
          },
          {
            "name": "OpenAIAdapter.stream recorded scenarios › Mixed notifications (cold + warm)",
            "value": 31.429,
            "unit": "ms",
            "extra": "[object Object]"
          },
          {
            "name": "OpenAIAdapter.stream recorded scenarios › Simple completion (cold + warm)",
            "value": 23.497,
            "unit": "ms",
            "extra": "[object Object]"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "that@teagantotally.rocks",
            "name": "Teagan Glenn",
            "username": "Teagan42"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "938521cc11990c30ef5b1ba20cd54bf23f02e3b0",
          "message": "Add Docker support via Dockerfile and compose dev workflow (#637)\n\n* refactor(tests): reuse docker fixtures\n\n* fix(docker): keep dev deps through build",
          "timestamp": "2025-10-19T12:48:07-06:00",
          "tree_id": "b20aa990694799158bbca10a40ccd5871867a192",
          "url": "https://github.com/Teagan42/Eddie/commit/938521cc11990c30ef5b1ba20cd54bf23f02e3b0"
        },
        "date": 1760900340978,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "OpenAIAdapter.stream recorded scenarios › Heavy tool-call loop (cold + warm)",
            "value": 51.47,
            "unit": "ms",
            "extra": "[object Object]"
          },
          {
            "name": "OpenAIAdapter.stream recorded scenarios › Mixed notifications (cold + warm)",
            "value": 31.904,
            "unit": "ms",
            "extra": "[object Object]"
          },
          {
            "name": "OpenAIAdapter.stream recorded scenarios › Simple completion (cold + warm)",
            "value": 23.486,
            "unit": "ms",
            "extra": "[object Object]"
          }
        ]
      }
    ]
  }
}