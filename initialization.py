from flask import current_app
from models import db, Lesson, User, Course, Module, Unit  # Import the new models
import json

def get_or_create_lessons_from_json():
    """
    Reads lessons from lessons.json and populates the database with a default
    course structure.
    """
    # Create a default course if it doesn't exist
    course = Course.query.filter_by(title="BISINDO Language").first()
    if not course:
        course = Course(title="BISINDO Language", description="Learn the basics of BISINDO sign language.")
        db.session.add(course)
        db.session.commit()

    # Create a default module for this course
    module = Module.query.filter_by(title="Introduction", course_id=course.id).first()
    if not module:
        module = Module(title="Introduction", course_id=course.id)
        db.session.add(module)
        db.session.commit()

    # Create a default unit for this module
    unit = Unit.query.filter_by(title="Getting Started", module_id=module.id).first()
    if not unit:
        unit = Unit(title="Getting Started", module_id=module.id)
        db.session.add(unit)
        db.session.commit()

    lessons_data_from_json = []
    try:
        with open('lessons.json') as f:
            lessons_data_from_json = json.load(f)
    except FileNotFoundError:
        current_app.logger.error("lessons.json not found. No lessons will be loaded.")
        return []
    except json.JSONDecodeError:
        current_app.logger.error("Error decoding lessons.json. Check its format.")
        return []

    for idx, lesson_data_item in enumerate(lessons_data_from_json):
        title = lesson_data_item.get('title')
        if not title:
            current_app.logger.warning(f"Skipping lesson item due to missing title: {lesson_data_item}")
            continue
        lesson_key = title.lower().replace(' ', '_')

        lesson = Lesson.query.filter_by(lesson_key=lesson_key).first()
        if not lesson:
            lesson = Lesson(
                lesson_key=lesson_key,
                title=title,
                url=lesson_data_item.get('url'),
                order=idx,
                unit_id=unit.id  # <-- Associate the lesson with our new unit
            )
            db.session.add(lesson)
            current_app.logger.info(f"Creating new lesson: {title}")
        else:
            # Also update the unit_id for existing lessons
            lesson.unit_id = unit.id
            current_app.logger.info(f"Updating existing lesson: {title}")

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Database commit failed while seeding lessons: {e}")
        return []

    return Lesson.query.order_by(Lesson.order).all()

def create_admin_user():
    """
    Checks for an existing admin user and creates one if not found.
    """
    admin_email = "admin@example.com"
    user = User.query.filter_by(email=admin_email).first()

    if not user:
        admin_user = User(
            name="Admin",
            age=99,
            email=admin_email,
            password="admin", # IMPORTANT: In a real application, you must hash this password!
            is_verified = True,
            username="@admin",
            lives = 100000,
            points = 10000,
        )
        db.session.add(admin_user)
        try:
            db.session.commit()
            current_app.logger.info(f"Admin user created with email: {admin_email}")
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Failed to create admin user: {e}")
    else:
        current_app.logger.info(f"Admin user with email {admin_email} already exists.")

# Add this to initialization.py or run it where you seed the DB
from models import db, ShopItem

def seed_shop_items():
    items = [
        {
            "name": "Refill Hearts",
            "description": "Restore all your hearts to continue learning",
            "price": 350,
            "icon_class": "fas fa-heart",
            "item_key": "refill_hearts",
            "icon_background_class" : "item-icon heart-icon"
        },
        {
            "name": "Streak Freeze",
            "description": "Protect your streak for one day",
            "price": 200,
            "icon_class": "fas fa-snowflake",
            "item_key": "streak_freeze",
            "icon_background_class" : "item-icon freeze-icon"
        },
        {
            "name": "XP Boost",
            "description": "Double XP for 15 minutes",
            "price": 500,
            "icon_class": "fas fa-rocket",
            "item_key": "xp_boost",
            "icon_background_class" : "item-icon boost-icon"
        },
        {
            "name": "Timer Freeze",
            "description": "Stop the timer for 30 seconds in timed challenges",
            "price": 300,
            "icon_class": "fas fa-clock",
            "item_key": "timer_freeze",
            "icon_background_class" : "item-icon timer-icon"
        }
    ]

    for data in items:
        item = ShopItem.query.filter_by(item_key=data['item_key']).first()
        if not item:
            item = ShopItem(**data)
            db.session.add(item)
    
    db.session.commit()
    print("Shop items seeded successfully.")