import diplomacy from '../../../config/balance/diplomacy.json'
import economy from '../../../config/balance/economy.json'
import espionage from '../../../config/balance/espionage.json'
import map from '../../../config/balance/map.json'
import market from '../../../config/balance/market.json'
import military from '../../../config/balance/military.json'
import society from '../../../config/balance/society.json'
import territory from '../../../config/balance/territory.json'
import time from '../../../config/balance/time.json'
import world from '../../../config/balance/world.json'

export const balance = { diplomacy, economy, espionage, map, market, military, society, territory, time, world } as const
