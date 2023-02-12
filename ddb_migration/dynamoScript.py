import boto3
import json

dynamodb_client = boto3.client("dynamodb")

table_name = "HiddenCities"

file = open("/Users/yathushannadanapathan/Desktop/Atlantis/cache-table.json")
data = json.load(file)
count = 0

for i in data:
    count += 1

    entry = {
        "Source": {"S": i["X"]},
        "Destination": {"S": i["Y"]},
        "HiddenCities": {"L": []}
    }

    for city in i["Z"]:
        entry["HiddenCities"]["L"].append({"S": city})

    response = dynamodb_client.put_item(
        TableName=table_name,
        Item=entry,
    )

    if (count % 100 == 0):
        print(count)

print(response)
