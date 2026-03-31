import os
import json
from flask import current_app
from models import db, Course, Module, Unit, Lesson, LessonStep, Question, User, ShopItem

def seed_curriculum():
    """
    Reads all JSON files in the 'curriculum' directory and dynamically 
    populates the database with courses, modules, units, lessons, and questions.
    """
    curriculum_dir = 'curriculum'
    
    # Check if the curriculum directory exists
    if not os.path.exists(curriculum_dir):
        current_app.logger.warning(f"Directory '{curriculum_dir}' not found. Skipping curriculum seeding.")
        return

    # Loop through every file in the folder
    for filename in os.listdir(curriculum_dir):
        if not filename.endswith('.json'):
            continue
            
        filepath = os.path.join(curriculum_dir, filename)
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            current_app.logger.error(f"Error reading {filename}: {e}")
            continue
            
        # 1. Process Course
        course_title = data.get('course_title')
        if not course_title:
            continue # Skip if no course title is found
            
        course = Course.query.filter_by(title=course_title).first()
        if not course:
            course = Course(
                title=course_title,
                language_code=data.get('language_code', '')
            )
            db.session.add(course)
            db.session.flush() # Flushes to DB to generate an ID without fully committing yet
            
        # 2. Process Modules
        for mod_data in data.get('modules', []):
            module = Module.query.filter_by(title=mod_data.get('title'), course_id=course.id).first()
            if not module:
                module = Module(
                    title=mod_data.get('title'),
                    order=mod_data.get('order', 0),
                    course_id=course.id
                )
                db.session.add(module)
                db.session.flush()
                
            # 3. Process Units
            for unit_data in mod_data.get('units', []):
                unit = Unit.query.filter_by(title=unit_data.get('title'), module_id=module.id).first()
                if not unit:
                    unit = Unit(
                        title=unit_data.get('title'),
                        order=unit_data.get('order', 0),
                        module_id=module.id
                    )
                    db.session.add(unit)
                    db.session.flush()
                    
                # 4. Process Lessons
                for lesson_data in unit_data.get('lessons', []):
                    lesson = Lesson.query.filter_by(title=lesson_data.get('title'), unit_id=unit.id).first()
                    if not lesson:
                        lesson = Lesson(
                            title=lesson_data.get('title'),
                            order=lesson_data.get('order', 0),
                            unit_id=unit.id
                        )
                        db.session.add(lesson)
                        db.session.flush()

                    # 5. Process Lesson Steps
                    for step_data in lesson_data.get('steps', []):
                        step_key = step_data.get('step_key')
                        step = LessonStep.query.filter_by(step_key=step_key).first()
                        
                        if not step:
                            step = LessonStep(
                                step_key=step_key,
                                lesson_id=lesson.id,
                                step_type=step_data.get('step_type'),
                                url=step_data.get('url'),
                                order=step_data.get('order', 0)
                            )
                            db.session.add(step)
                            db.session.flush()

                        # 6. Process Questions
                        Question.query.filter_by(step_id=step.id).delete()
                        for q_idx, q_data in enumerate(step_data.get('questions', [])):
                            question = Question(
                                step_id=step.id,
                                question_type=q_data.get('question_type', 'multiple_choice'),
                                prompt_text=q_data.get('prompt_text'),
                                image_url=q_data.get('image_url'),
                                correct_answer=q_data.get('correct_answer'),
                                choices=q_data.get('choices', []),
                                order=q_idx + 1
                            )
                            db.session.add(question)
                        
    # Finally, commit the whole curriculum to the database
    try:
        db.session.commit()
        print("Successfully seeded all curriculum data from JSON files!")
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Database commit failed during curriculum seeding: {e}")

def create_admin_user():
    admin_email = "admin@example.com"
    user = User.query.filter_by(email=admin_email).first()

    if not user:
        admin_user = User(
            name="Admin",
            age=99,
            email=admin_email,
            password="admin",
            is_verified = True,
            username="@admin",
            lives = 100000,
            points = 10000,
        )
        db.session.add(admin_user)
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()

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