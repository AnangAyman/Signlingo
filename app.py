from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from models import db
from initialization import get_or_create_lessons_from_json, create_admin_user, seed_shop_items
import os
from flask_mail import Mail

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.sqlite'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'supersecretkey'  # Required for session management

app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = 'signlingolanguage@gmail.com'         # <-- your email
app.config['MAIL_PASSWORD'] = 'frpk wyzu xdlf tyyj'      # <-- app password
mail = Mail(app)


# Import and register the Blueprint
from routes import auth_bp
app.register_blueprint(auth_bp)

db.init_app(app)

from flask_migrate import Migrate
migrate = Migrate(app, db)

# This command is for resetting the database during the build.
@app.cli.command("init-app")
def init_app_command():
    """Clears existing data and seeds the database with lessons and an admin user."""
    with app.app_context():
        db.drop_all()
        db.create_all()
        print("Database initialized successfully!")
        
        get_or_create_lessons_from_json()
        print("Lessons seeded successfully!")
        
        create_admin_user()
        print("Admin user created.")

        seed_shop_items()
        print("Shop items seeded")
    print("Application initialization finished!")

if __name__ == '__main__':
    app.run(debug=True)

