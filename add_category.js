import db from './backend/database.js';

db.serialize(() => {
    db.run("INSERT INTO categories (name, slug, image) VALUES (?, ?, ?)",
        ['Drum Plants', 'drum-plants', 'https://placehold.co/150?text=Drum+Plants'],
        function (err) {
            if (err) {
                console.error("Error inserting category:", err.message);
            } else {
                console.log("Successfully added Drum Plants category with ID:", this.lastID);
            }
            db.close();
        }
    );
});
