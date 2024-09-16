/*
Process row in each daily journal `processingDate`:
    1. Mention [[Review/Daily]]
        next+=1d
    2. Mention [[Review/Weekly]]
        next+=1w
    3. Mention [[Review/Monthly]]
        next+=1m

If current "daily note" (curDate - processingDate - offset == next), copy to-do item with mentioning

If current "daily note" (curDate - processingDate - offset > next) and is not completed, move to-do item with mentioning, adding { offset=`curDate` - `processingDate` - `next`}

*/
class recurrentsRollover {
    async saveFile(app, filename, content) {
    }

    async rolloverTodos(app, dv, pages, removeOriginals) {
    }

    async run(app, dv, pagesList, removeOriginals = false) {
    }
}
