# Airport directory

airports.json was generated on 15 October 2026 from https://ourairports.com/data/airports.csv . OurAirports releases its data into the public domain: https://ourairports.com/data/ . The directory includes medium/large airports with three-letter IATA codes. It is a search aid; actual route availability comes from TripJack.

## Airport timezone identities

`airport-timezones.json` is an adaptation of the OpenFlights airport database, © OpenFlights contributors, made available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The adapted database is available under that same license in this public repository. [Original source and format](https://openflights.org/data.php). The pinned source URL, source SHA-256 and import date are in `airport-timezones.source.json`. Preserve this attribution and license when distributing the adapted database.

Only IATA/IANA identities are imported. Numeric offsets and historical DST flags are discarded. Runtime ICU supplies date-specific rules. Conflicting airport identities and unknown/ambiguous local timestamps fail closed. This dataset is not evidence of a current flight, route or fare.
