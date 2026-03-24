# Signal Labels Reference

56 TA signal labels + 10 chart pattern labels = 66 total. Chip colors used by `renderer.js` and `trades.js` for signal display.

Labels in the hardcoded `positive`/`negative` arrays get that class directly. All others fall through to score-based classification: score >= 70 = positive, score <= 30 = negative, else neutral.

**Note:** `trades.js` includes `STRONG_TREND` and `TRENDING` in its positive set; `renderer.js` does not (they fall through to score-based classification there). Both files use the same fallback logic for unrecognized labels.

| Label             | Chip class | Meaning                        |
|-------------------|------------|-------------------------------|
| OVERSOLD          | positive   | RSI < 30 — strong buy signal  |
| NEAR_OVERSOLD     | positive   | RSI 30-40                     |
| NEUTRAL           | neutral    | RSI 40-70 — mid-range (score-based) |
| BULL_CROSS        | positive   | MACD crossed above signal     |
| HIST_TURN_UP      | positive   | MACD histogram rising while below zero (early bullish) |
| BULLISH           | positive   | MACD line above zero          |
| AT_KEY_LEVEL      | positive   | Near 0.618 or 0.786 fib       |
| AT_FIB_LEVEL      | positive   | Near any fib level (+/-1.5%)  |
| GOLDEN_ZONE       | positive   | Fib 50-61.8% retracement — optimal entry (score 80). Only in `evalFibonacci()` — inactive since fibonacci removed from scoring engine (Mar 12) |
| SHALLOW_RETRACEMENT | neutral  | Fib retracement < 38.2% (score 65). Inactive — see GOLDEN_ZONE note |
| DEEP_RETRACEMENT  | neutral    | Fib retracement > 61.8% (score 45). Inactive — see GOLDEN_ZONE note |
| EMA_CROSS_UP      | positive   | Fast EMA just crossed above slow EMA |
| EMA_BULLISH       | positive   | Fast EMA above slow EMA (no recent cross) |
| VOL_CONFIRM_BULL  | positive   | Rising price + rising volume   |
| VOL_EXHAUSTION    | positive   | Falling price + falling volume (selling drying up) |
| VOL_NEUTRAL       | neutral    | No clear price/volume direction (score 50) |
| SELLING_CLIMAX    | positive   | Volume climax on sell side — capitulation bottom (score 75) |
| BUYING_CLIMAX     | negative   | Volume climax on buy side — exhaustion top (score 30) |
| OVERBOUGHT        | negative   | RSI > 70                      |
| BEAR_CROSS        | negative   | MACD crossed below signal     |
| HIST_TURN_DOWN    | negative   | MACD histogram falling while above zero (early bearish) |
| BEARISH           | negative   | MACD line below zero          |
| EMA_CROSS_DOWN    | negative   | Fast EMA just crossed below slow EMA |
| EMA_BEARISH       | negative   | Fast EMA below slow EMA       |
| VOL_CONFIRM_BEAR  | negative   | Falling price + rising volume (dump confirmed) |
| VOL_DIVERGE_WARN  | negative   | Rising price + falling volume (thin rally) |
| RSI_BULL_DIVERGENCE    | positive | Price lower low + RSI higher low |
| MACD_BULL_DIVERGENCE   | positive | Price lower low + histogram higher low |
| DOUBLE_BULL_DIVERGENCE | positive | Both RSI + MACD bullish divergence |
| RSI_BEAR_DIVERGENCE    | negative | Price higher high + RSI lower high |
| MACD_BEAR_DIVERGENCE   | negative | Price higher high + histogram lower high |
| DOUBLE_BEAR_DIVERGENCE | negative | Both RSI + MACD bearish divergence |
| MIXED_DIVERGENCE       | neutral  | Conflicting bullish + bearish signals |
| STRONG_TREND      | positive*  | ADX >= 40 — strong directional move (score 85-95) |
| TRENDING          | positive*  | ADX >= 25 — trending (score 60-75, may be neutral if not rising) |
| WEAK_TREND        | neutral    | ADX between 20 and 25 (score 40)  |
| RANGING           | negative   | ADX <= 20 — choppy / no trend (score 20) |
| NEAR_FIB          | neutral    | Within 5% of a fib level      |
| BETWEEN_LEVELS    | neutral    | No nearby fib level           |
| SQUEEZE           | positive   | BB bandwidth < threshold — volatility compression |
| SQUEEZE_BREAKOUT_UP   | positive | BB squeeze broke upward (score 85) |
| SQUEEZE_BREAKOUT_DOWN | negative | BB squeeze broke downward (score 15) |
| TIGHT_SQUEEZE     | neutral    | BB squeeze held 3+ candles (score 60) |
| BELOW_LOWER       | positive   | Price below lower BB — oversold bounce candidate |
| NEAR_LOWER        | positive   | Price near lower BB (%B < 0.20) |
| MID_BAND          | neutral    | Price mid Bollinger Band       |
| NEAR_UPPER        | negative   | Price near upper BB (%B > 0.80) |
| ABOVE_UPPER       | negative   | Price above upper BB — extended |
| OBV_CONFIRM_BULL  | positive   | OBV + price both rising        |
| OBV_CONFIRM_BEAR  | negative   | OBV + price both falling       |
| OBV_BULL_DIVERGE  | positive   | OBV rising, price falling — accumulation |
| OBV_BEAR_DIVERGE  | negative   | OBV falling, price rising — distribution |
| OBV_FLAT          | neutral    | OBV no clear direction         |
| RSI_BULL_FAIL_SWING | positive | Wilder bullish failure swing   |
| RSI_BEAR_FAIL_SWING | negative | Wilder bearish failure swing   |
| INSUFFICIENT_DATA | —          | Not enough candles            |

### Chart Pattern Labels (direct payload chips, weight 0)

Pattern types from `chart-patterns.js`. Displayed as chips via `t.chartPatterns.patterns[0].type`. All rendered with score 50 (neutral). Not in signalBreakdown — appear as direct payload chips only.

| Label                        | Chip class | Meaning                              |
|------------------------------|------------|--------------------------------------|
| DOUBLE_BOTTOM                | neutral    | Bullish reversal pattern             |
| DOUBLE_TOP                   | neutral    | Bearish reversal pattern             |
| INVERSE_HEAD_AND_SHOULDERS   | neutral    | Bullish reversal pattern             |
| HEAD_AND_SHOULDERS           | neutral    | Bearish reversal pattern             |
| BULL_FLAG                    | neutral    | Bullish continuation                 |
| BEAR_FLAG                    | neutral    | Bearish continuation                 |
| ASCENDING_TRIANGLE           | neutral    | Bullish breakout                     |
| DESCENDING_TRIANGLE          | neutral    | Bearish breakout                     |
| PENNANT_BULL                 | neutral    | Bullish consolidation                |
| PENNANT_BEAR                 | neutral    | Bearish consolidation                |

*\* Hardcoded positive in `trades.js` only. In `renderer.js`, falls through to score-based classification.*
