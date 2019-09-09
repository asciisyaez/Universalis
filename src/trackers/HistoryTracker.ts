import { getWorldDC, getWorldName } from "../util";

import { Tracker } from "./Tracker";

import { Collection } from "mongodb";

import { ExtendedDCHistory } from "../models/ExtendedDCHistory";
import { ExtendedHistory } from "../models/ExtendedHistory";
import { MarketBoardDCHistoryEntry } from "../models/MarketBoardDCHistoryEntry";
import { MarketBoardHistoryEntry } from "../models/MarketBoardHistoryEntry";
import { MarketInfoLocalData } from "../models/MarketInfoLocalData";
import { MinimizedDCHistoryEntry } from "../models/MinimizedDCHistoryEntry";
import { MinimizedHistoryEntry } from "../models/MinimizedHistoryEntry";

export class HistoryTracker extends Tracker {
    private extendedHistory: Collection;

    constructor(recentData: Collection, extendedHistory: Collection) {
        super(recentData);
        this.extendedHistory = extendedHistory;
    }

    public async set(uploaderID: string, itemID: number, worldID: number, recentHistory: MarketBoardHistoryEntry[]) {
        let data: MarketInfoLocalData = {
            itemID,
            recentHistory,
            uploaderID,
            worldID
        };

        const query = { worldID, itemID };

        const existing = await this.collection.findOne(query) as MarketInfoLocalData;
        if (existing && existing.listings) {
            data.listings = existing.listings;
        }

        this.updateDataCenterProperty(uploaderID, "recentHistory", itemID, worldID, recentHistory);
        this.updateExtendedDCHistory(uploaderID, itemID, worldID, recentHistory);
        this.updateExtendedHistory(uploaderID, itemID, worldID, recentHistory);

        if (existing) {
            await this.collection.updateOne(query, { $set: data });
        } else {
            await this.collection.insertOne(data);
        }
    }

    private async updateExtendedHistory(uploaderID: string, itemID: number, worldID: number, entries: MarketBoardHistoryEntry[]) {
        // Cut out any properties we don't need
        let minimizedEntries: MinimizedHistoryEntry[] = entries.map((entry) => {
            return {
                hq: entry.hq,
                pricePerUnit: entry.pricePerUnit,
                timestamp: entry.timestamp
            };
        });

        const query = { worldID, itemID };

        const existing = await this.extendedHistory.findOne(query) as ExtendedHistory;

        let extendedHistory: ExtendedHistory;
        if (existing) {
            extendedHistory = existing;
        } else {
            extendedHistory = {
                entries: [],
                itemID,
                uploaderID,
                worldID
            };
        }

        // Limit to 500 entries
        let entrySum = extendedHistory.entries.length + minimizedEntries.length;
        if (entrySum > 500) {
            extendedHistory.entries = extendedHistory.entries.slice(0, 500 - minimizedEntries.length);
        }
        extendedHistory.entries = minimizedEntries.concat(extendedHistory.entries);

        if (existing) {
            return await this.extendedHistory.updateOne(query, { $set: extendedHistory });
        } else {
            return await this.extendedHistory.insertOne(extendedHistory);
        }
    }

    private async updateExtendedDCHistory(uploaderID: string, itemID: number, worldID: number, entries: MarketBoardHistoryEntry[]) {
        const world = await getWorldName(worldID);
        const dcName = await getWorldDC(world);

        // Append world name to each entry
        (entries as MarketBoardDCHistoryEntry[]).forEach((entry) => entry.worldName = world);

        let minimizedEntries: MinimizedDCHistoryEntry[] = entries.map((entry) => {
            return {
                hq: entry.hq,
                pricePerUnit: entry.pricePerUnit,
                timestamp: entry.timestamp,
                uploaderID,
                worldName: world
            };
        });

        const query = { dcName, itemID };

        const existing = await this.extendedHistory.findOne(query) as ExtendedDCHistory;

        let extendedHistory: ExtendedDCHistory;
        if (existing) extendedHistory = existing;
        if (extendedHistory && extendedHistory.entries) { // Delete entries from the upload world
            extendedHistory.entries = extendedHistory.entries.filter((entry) => entry.worldName !== world);

            extendedHistory.entries = extendedHistory.entries.concat(minimizedEntries);
        } else {
            extendedHistory = {
                dcName,
                entries: [],
                itemID,
            };
        }

        let entrySum = extendedHistory.entries.length + minimizedEntries.length;
        if (entrySum > 500) {
            extendedHistory.entries = extendedHistory.entries.slice(0, 500 - minimizedEntries.length);
        }

        if (existing) {
            return await this.extendedHistory.updateOne(query, { $set: extendedHistory });
        } else {
            return await this.extendedHistory.insertOne(extendedHistory);
        }
    }
}
