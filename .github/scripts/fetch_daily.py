#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每日行情数据抓取脚本（由 GitHub Actions 定时调用）。

职责：
  1. 气象：调用 Open-Meteo 公开接口（无需 API Key）抓取海南·三亚实时气象。
  2. 新闻：尝试从 RSS 聚合抓取农业资讯（best-effort，失败则保留旧值）。
  3. 价格 / 种植建议：保留 data/daily.json 中已有内容（由用户的 WorkBuddy
     自动化或价格 API 维护），本脚本不覆盖。

输出：写回仓库根目录 data/daily.json，供工作台（workbench.html）读取渲染。

设计原则：任何单源失败都不影响整体 —— 工作流始终成功、JSON 始终有效。
"""
import json
import os
import sys
import ssl
import datetime
import urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data", "daily.json")

# 三亚海棠湾一带坐标（海南演艺中心 / 东方市可在此改）
LAT, LON = 18.2528, 109.5119
WEATHER_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude={lat}&longitude={lon}"
    "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m"
    "&wind_speed_unit=ms&timezone=Asia%2FShanghai"
).format(lat=LAT, lon=LON)

# 农业资讯 RSS 源（可在此增删；任一失败不影响整体）
NEWS_FEEDS = [
    # 农业农村部 / 中国农业信息网等如有可用 RSS，填入此处即可自动生效
    # "https://example.com/agri-news.rss",
]


def http_get(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (runye-daily)"})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.read().decode("utf-8", "ignore")


def fetch_weather():
    try:
        raw = http_get(WEATHER_URL)
        d = json.loads(raw)
        c = d.get("current", {})
        wind_ms = c.get("wind_speed_10m")
        wind = ("%.1f m/s" % wind_ms) if wind_ms is not None else None
        return {
            "location": "海南·三亚",
            "temp": c.get("temperature_2m"),
            "rain_mm": c.get("precipitation"),
            "humidity": c.get("relative_humidity_2m"),
            "wind": wind,
            "note": "Open-Meteo 实时气象（每日 09:00 北京时间自动更新）",
        }
    except Exception as e:
        print("[warn] weather fetch failed:", e, file=sys.stderr)
        return None


def parse_rss(xml_text):
    items = []
    try:
        root = ET.fromstring(xml_text)
        for item in root.iter("item"):
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            pub = (item.findtext("pubDate") or "").strip()
            src = (item.findtext("{http://purl.org/dc/elements/1.1/}creator") or "").strip()
            if title:
                items.append({
                    "title": title,
                    "url": link or "#",
                    "source": src or "RSS",
                    "date": pub[:10] if pub else "",
                })
    except Exception as e:
        print("[warn] rss parse failed:", e, file=sys.stderr)
    return items


def fetch_news():
    items = []
    for url in NEWS_FEEDS:
        try:
            items.extend(parse_rss(http_get(url)))
        except Exception as e:
            print("[warn] news feed failed:", url, e, file=sys.stderr)
    # 去重（按标题）
    seen, uniq = set(), []
    for it in items:
        if it["title"] not in seen:
            seen.add(it["title"])
            uniq.append(it)
    return uniq[:8]


def load_existing():
    if os.path.exists(DATA):
        try:
            with open(DATA, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print("[warn] load existing daily.json failed:", e, file=sys.stderr)
    return {}


def main():
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
    existing = load_existing()

    out = {
        "updated_at": now.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        "schema_version": existing.get("schema_version", 1),
        "source": "github-actions",
    }

    w = fetch_weather()
    out["weather"] = w if w else existing.get("weather", {})

    # 价格 / 种植建议：保留现有（由用户的 WorkBuddy 自动化或价格 API 维护）
    out["prices"] = existing.get("prices", {})
    out["advice"] = existing.get("advice", {})

    news = fetch_news()
    out["news"] = news if news else existing.get("news", [])

    os.makedirs(os.path.dirname(DATA), exist_ok=True)
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("[ok] wrote", DATA, "| weather:", bool(w), "| news:", len(out["news"]))


if __name__ == "__main__":
    main()
