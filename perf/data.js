window.BENCHMARK_DATA = {
  "lastUpdate": 1760895686744,
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
      }
    ]
  }
}