import json

file = open("cache-table.json")

data = json.load(file)
print(len(data))
new_data = {"CacheTable": []}

for i in data:

    entry = {
        "PutRequest":
        {
            "Item": {
                "Source": {"S": i["X"]},
                "Destination": {"S": i["Y"]},
                "HiddenCities": {"L": []}
            }
        }
    }

    for city in i["Z"]:
        entry["PutRequest"]["Item"]["HiddenCities"]["L"].append({"S": city})

    new_data["CacheTable"].append(entry)


with open("sample.json", "w") as outfile:
    json.dump(new_data, outfile)

file.close()
