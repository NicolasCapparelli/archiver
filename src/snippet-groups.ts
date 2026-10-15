import type { Item } from "./api";

export function snippetGroups(items: Item[], known: string[] = [], collection = "") {
  const groups = new Map<string, { name: string; items: Item[] }>();
  const add = (name: string) => {
    const key = name.toLocaleLowerCase();
    if (!groups.has(key)) groups.set(key, { name, items: [] });
    return groups.get(key)!;
  };
  for (const name of collection ? [collection] : known) add(name);
  for (const item of items) {
    const memberships = item.collections?.length ? item.collections : [""];
    for (const name of new Map(memberships.map(name => [name.toLocaleLowerCase(), name])).values()) {
      if (!collection || name.toLocaleLowerCase() === collection.toLocaleLowerCase()) add(name).items.push(item);
    }
  }
  return [...groups.values()].sort((a, b) => a.name ? b.name ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) : -1 : 1);
}
