from flask import Blueprint, render_template, request, redirect, url_for, session, jsonify, flash
from models import Lesson, UserLessonStatus, db, User  # Import the database and User model
import random,json
from tertiary import get_initials, get_random_question

auth_bp = Blueprint('auth', __name__)  # Define the Blueprint

@auth_bp.route('/')
def home():
    session.clear()
    return render_template('landing_page.html', user=session.get('user'))

# ----------------------------------- AUTHENTICATION ------------------------------------------------

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        print(request.form) #! For debugging delete later
        age = request.form.get('age')

        name = request.form.get('name')
        if name == "":
            name = "Anonymous Wanderer"

        email = request.form.get('email')
        password = request.form.get('password')

        if User.query.filter_by(email=email).first():
            error_message = "Email already exists."
            return render_template('sign_up.html', error=error_message)

        new_user = User(age=age, name=name, email=email, password=password)
        db.session.add(new_user)
        db.session.commit()
        return redirect(url_for('auth.login'))

    return render_template('sign_up.html')

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        print(request.form) #! Debugging delete later
        email = request.form['email']
        password = request.form['password']

        user = User.query.filter_by(email=email, password=password).first()
        if user:
            session['user'] = email
            session['user_id'] = user.id 
            return redirect(url_for('auth.dashboard'))
        else:
            error_message =  "Invalid credentials."
            return render_template('login.html', error=error_message)
    return render_template('login.html')

@auth_bp.route('/dashboard', methods=['GET', 'POST'])
def dashboard():
    user_id = session.get('user_id')
    print(user_id)
    
    if not user_id:
        return redirect(url_for('auth.login'))
    
    login_today = session.get("today_login")
    print(login_today)

    user = User.query.get(user_id)
    full_name = user.name

    first_name,initials = get_initials(full_name)

    return render_template("dashboard.html",
                           full_name=full_name, 
                           first_name=first_name, 
                           initials=initials,
                           login_today=login_today,
                           user_points = user.points,
                           user_league = user.league)

@auth_bp.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('auth.home'))

# ----------------------------------- FORGOT/RESET PASSWORD ROUTES ------------------------------------

# Later on use database table with expiry if I have time
reset_tokens = {} 

def generate_reset_token():
    return os.urandom(24).hex()

@auth_bp.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    if request.method == 'POST':
        email = request.form.get('email')
        user = User.query.filter_by(email=email).first()
        
        if user:
            token = generate_reset_token()
            reset_tokens[token] = user.email # Store token with user's email

            print(f"\n------------- PASSWORD RESET TOKEN ----------------")
            print(f"DEBUG: Password reset token for {user.email}: {token}")
            print(f"DEBUG: Reset URL: {url_for('auth.reset_password', token=token, _external=True)}")
            print(f"------------- PASSWORD RESET TOKEN ----------------\n")
            flash(f'If an account with {email} exists, a password reset link has been (simulated) sent. Please check your (console/email) for the link.', 'success')
        else:
            flash(f'If an account with {email} exists, a password reset link has been (simulated) sent.', 'success') # Generic message for security
            
        return redirect(url_for('auth.forgot_password'))
        
    return render_template('forgot_password.html')

@auth_bp.route('/reset_password/<token>', methods=['GET', 'POST'])
def reset_password(token):
    email = reset_tokens.get(token)
    if not email:
        flash('Invalid or expired password reset token.', 'danger')
        return redirect(url_for('auth.forgot_password'))

    user = User.query.filter_by(email=email).first()
    if not user:
        # This case should ideally not be reached if token was validly generated for an existing user
        flash('User not found for this token.', 'danger')
        return redirect(url_for('auth.forgot_password'))

    if request.method == 'POST':
        new_password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')

        if new_password != confirm_password:
            flash('Passwords do not match.', 'danger')
            return render_template('reset_password.html', token=token)
        
        if len(new_password) < 6: # Example: Enforce minimum password length
            flash('Password must be at least 6 characters long.', 'danger')
            return render_template('reset_password.html', token=token)

        user.password = new_password
        db.session.commit()
        
        # Invalidate the token after use
        if token in reset_tokens:
            del reset_tokens[token]
            
        flash('Your password has been successfully reset! Please log in.', 'success')
        return redirect(url_for('auth.login'))

    return render_template('reset_password.html', token=token)

# ----------------------------------- Leaderboards page ----------------------------------------

# ... (at the end of your routes.py file)

@auth_bp.route('/leaderboard')
def leaderboard():
    user_id = session.get('user_id')
    if not user_id:
        flash('Please log in to view the leaderboard.', 'warning')
        return redirect(url_for('auth.login'))

    current_user = User.query.get(user_id)
    if not current_user:
        flash('User not found.', 'danger')
        return redirect(url_for('auth.login'))

    # 1. Get friends leaderboard (including the current user in the list)
    # We query the friends and then add the current user to the list for display
    friends = current_user.friends.all()
    friends_leaderboard = sorted(friends + [current_user], key=lambda x: x.points, reverse=True)

    # 2. Get league leaderboard
    # We find all users and filter them by league in Python.
    # For a very large app, you might do this with a more complex database query.
    all_users = User.query.order_by(User.points.desc()).all()
    league_users = [user for user in all_users if user.league == current_user.league]

    return render_template('leaderboard.html',
                           current_user=current_user,
                           friends_leaderboard=friends_leaderboard,
                           league_users=league_users,
                           league_name=current_user.league)

# ----------------------------------- FRIENDS & USERS LIST -----------------------------------

@auth_bp.route('/users')
def list_users():
    user_id = session.get('user_id')
    if not user_id:
        flash('Please log in to find users.', 'warning')
        return redirect(url_for('auth.login'))

    current_user = User.query.get(user_id)
    all_users = User.query.filter(User.id != user_id).order_by(User.name).all()

    return render_template('users.html', all_users=all_users, current_user=current_user)

@auth_bp.route('/add_friend/<int:friend_id>', methods=['POST'])
def add_friend(friend_id):
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.login'))

    user = User.query.get(user_id)
    friend_to_add = User.query.get(friend_id)

    if friend_to_add:
        user.add_friend(friend_to_add)
        db.session.commit()
        flash(f'You are now friends with {friend_to_add.name}!', 'success')
    else:
        flash('User not found.', 'danger')

    return redirect(url_for('auth.list_users'))

@auth_bp.route('/remove_friend/<int:friend_id>', methods=['POST'])
def remove_friend(friend_id):
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.login'))

    user = User.query.get(user_id)
    friend_to_remove = User.query.get(friend_id)

    if friend_to_remove:
        user.remove_friend(friend_to_remove)
        db.session.commit()
        flash(f'You have removed {friend_to_remove.name} from your friends.', 'info')
    else:
        flash('User not found.', 'danger')

    return redirect(url_for('auth.list_users'))


# ----------------------------------- GAME PAGE ------------------------------------------------

with open('questions.json') as f:
    questions = json.load(f)

with open('lessons.json') as f:
    lessons = json.load(f)

with open('ml_questions.json') as f:
    ml_questions = json.load(f)

@auth_bp.route('/ml_game', methods=['GET', 'POST'])
def ml_game():
    user_id = session.get('user_id')
    if not user_id:
        flash('Please log in to play the ML game.', 'warning')
        return redirect(url_for('auth.login'))

    # Fetch all defined lessons from the database.
    # This assumes the 'Lesson' table has been populated (e.g., by 'flask seed_lessons').
    all_db_lessons = Lesson.query.order_by(Lesson.order).all()
    if not all_db_lessons:
        flash("Learning lessons are not yet available. Please ask an administrator to set them up.", "warning")
        # Fallback to an empty list or handle as an error, but ideally, lessons should be seeded.
        all_db_lessons = [] 

    user_lessons_with_status = []
    total_lessons_count = len(all_db_lessons)
    completed_lessons_count = 0

    for db_lesson in all_db_lessons:
        status_entry = UserLessonStatus.query.filter_by(user_id=user_id, lesson_id=db_lesson.id).first()
        current_status = status_entry.status if status_entry else 'not_started'
        if current_status == 'completed':
            completed_lessons_count += 1
        
        # Determine if the current page's lesson should be marked as 'current' in the sidebar
        is_current_page_lesson = (request.path == db_lesson.url)
        
        display_status = current_status
        if is_current_page_lesson and current_status != 'completed':
            display_status = 'current'

        user_lessons_with_status.append({
            'title': db_lesson.title,
            'url': db_lesson.url,
            'status': display_status, # Use the determined display_status
            'lesson_key': db_lesson.lesson_key
        })
    
    module_progress_percent = (completed_lessons_count / total_lessons_count) * 100 if total_lessons_count > 0 else 0
    
    # Placeholder for module accuracy - you'd need a way to calculate and store this if desired
    module_accuracy = "N/A" 

    return render_template(
        "ml_game.html", 
        user=session.get('user'), 
        lessons=user_lessons_with_status,
        module_progress_percent=module_progress_percent,
        completed_lessons_count=completed_lessons_count,
        total_lessons_count=total_lessons_count,
        module_accuracy=module_accuracy # Pass this to the template
    )

# In routes.py
@auth_bp.route('/video_learning')
def video_learning():
    user_id = session.get('user_id')
    if not user_id:
        flash('Please log in to access learning videos.', 'warning')
        return redirect(url_for('auth.login'))

    all_db_lessons = Lesson.query.order_by(Lesson.order).all() # Assumes lessons are seeded
    # (If not seeded, you might call get_or_create_lessons_from_json() here, but preferably seeded via CLI)
    
    user_lessons_with_status = []
    total_lessons_count = len(all_db_lessons)
    completed_lessons_count = 0

    for db_lesson in all_db_lessons:
        status_entry = UserLessonStatus.query.filter_by(user_id=user_id, lesson_id=db_lesson.id).first()
        current_status = status_entry.status if status_entry else 'not_started'
        if current_status == 'completed':
            completed_lessons_count += 1
        
        is_current_page_lesson = (request.path == db_lesson.url)
        user_lessons_with_status.append({
            'title': db_lesson.title,
            'url': db_lesson.url,
            'status': 'current' if is_current_page_lesson and current_status != 'completed' else current_status,
            'lesson_key': db_lesson.lesson_key
        })
    
    module_progress_percent = (completed_lessons_count / total_lessons_count) * 100 if total_lessons_count > 0 else 0

    return render_template(
        "video_learning.html", 
        user=session.get('user'), 
        lessons=user_lessons_with_status,
        module_progress_percent=module_progress_percent,
        completed_lessons_count=completed_lessons_count,
        total_lessons_count=total_lessons_count
    )


from initialization import get_or_create_lessons_from_json
@auth_bp.route('/gamepage')
def gamepage():
    user_id = session.get('user_id')
    if not user_id:
        flash('Please log in to play the game.', 'warning')
        return redirect(url_for('auth.login'))

    # Ensure lessons are in the DB
    all_db_lessons = get_or_create_lessons_from_json() # Call this to ensure lessons table is populated

    user_lessons_with_status = []
    total_lessons_count = len(all_db_lessons)
    completed_lessons_count = 0

    for db_lesson in all_db_lessons:
        status_entry = UserLessonStatus.query.filter_by(user_id=user_id, lesson_id=db_lesson.id).first()
        current_status = status_entry.status if status_entry else 'not_started'
        if current_status == 'completed':
            completed_lessons_count += 1
        
        # Determine if the lesson is 'current' based on its URL matching the request path
        is_current_page_lesson = (request.path == db_lesson.url)

        user_lessons_with_status.append({
            'title': db_lesson.title,
            'url': db_lesson.url,
            'status': 'current' if is_current_page_lesson and current_status != 'completed' else current_status,
            'lesson_key': db_lesson.lesson_key # Pass lesson_key for client-side updates
        })
    
    # Recalculate overall progress for the "Bisindo Letters" module (assuming these lessons are it)
    # The progress bar in gamepage.html uses an ID 'progress-bar' for quiz questions.
    # The sidebar progress bar needs a different logic.
    # Let's assume the sidebar progress bar should reflect module completion
    module_progress_percent = (completed_lessons_count / total_lessons_count) * 100 if total_lessons_count > 0 else 0


    # This 'lessons' variable is what your template iterates over for the sidebar
    # The 'status' will now be user-specific.
    print(f"DEBUG: Current request.path: {request.path}")
    print(f"DEBUG: Lessons being passed to template: {user_lessons_with_status}")
    session.pop('questions_asked', None) 
    return render_template(
        "game_page.html", 
        user=session.get('user'), 
        lessons=user_lessons_with_status,
        module_progress_percent=module_progress_percent, # For the main module progress bar
        # The existing progress bar inside quiz-card is for quiz question progress, leave its JS as is.
        completed_lessons_count=completed_lessons_count,
        total_lessons_count=total_lessons_count
        # You might need to pass accuracy if you calculate and store it.
    )


@auth_bp.route('/mark-lesson-status', methods=['POST'])
def mark_lesson_status():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'User not logged in'}), 401

    data = request.json
    lesson_key = data.get('lesson_key') # Use the stable lesson_key
    new_status = data.get('status', 'completed') # Default to 'completed'
    score = data.get('score') # Optional

    if not lesson_key:
        return jsonify({'success': False, 'error': 'Lesson key missing'}), 400

    lesson = Lesson.query.filter_by(lesson_key=lesson_key).first()
    if not lesson:
        return jsonify({'success': False, 'error': 'Lesson not found'}), 404

    status_entry = UserLessonStatus.query.filter_by(user_id=user_id, lesson_id=lesson.id).first()
    if not status_entry:
        status_entry = UserLessonStatus(user_id=user_id, lesson_id=lesson.id)
        db.session.add(status_entry)
    
    status_entry.status = new_status
    if score is not None:
        status_entry.score = score
    
    db.session.commit()
    return jsonify({'success': True, 'message': f'Lesson {lesson.title} marked as {new_status}'})

@auth_bp.route('/course')
def course():
    user_id = session.get('user_id')
    
    if not user_id:
        return redirect(url_for('auth.login'))
    
    login_today = session.get("today_login")
    print(login_today)

    user = User.query.get(user_id)
    full_name = user.name

    first_name,initials = get_initials(full_name)
    return render_template("courses_final.html", user=session.get('user'), lessons=lessons, initials=initials, first_name=first_name, login_today=login_today)


@auth_bp.route('/get-question')
def get_question():
    question = get_random_question(questions)

    # Randomize the choices
    choices = question['choices']
    random_choices = random.sample(choices, len(choices))  # Shuffle choices

    # Prepare the response
    response = {
        'question': question['question'],
        'choices': random_choices,
        'answer': question['answer'],  # Keep the correct answer
        'image': question['image']
    }

    return jsonify(response)

@auth_bp.route('/get-question-ml')
def get_question_ml():
    question = get_random_question(ml_questions)

    # Prepare the response
    response = {
        'question': question['question'],
        'answer': question['answer'],  # Keep the correct answer
    }

    return jsonify(response)

@auth_bp.route('/check-answer', methods=['POST'])
def check_answer():
    session["today_login"] = True
    data = request.json
    selected = data.get('selected')
    correct = data.get('correct')

    is_correct = (selected == correct)
    if is_correct:
        user_id = session.get('user_id')
        if user_id:
            user = User.query.get(user_id)
            if user:
                user.points += 10  # Add 10 points
                db.session.commit() # Save the change to the database
    return jsonify({"result": selected == correct})

@auth_bp.route('/edit-account', methods=['GET', 'POST'])
def edit_account():
    user_id = session.get('user_id')
    if not user_id:
        flash('Please log in to edit your account.', 'warning')
        return redirect(url_for('auth.login'))

    user = User.query.get(user_id)
    full_name = user.name
    first_name,initials = get_initials(full_name)

    if not user:
        flash('User not found. Please log in again.', 'danger')
        session.pop('user_id', None)
        session.pop('user', None)
        session.pop('user_name', None)
        return redirect(url_for('auth.login'))

    if request.method == 'POST':
        # Get data from form
        name = request.form.get('name')
        age_str = request.form.get('age')
        email = request.form.get('email')
        
        current_password_form = request.form.get('current_password') # Renamed to avoid confusion with user.password
        new_password = request.form.get('new_password')
        confirm_new_password = request.form.get('confirm_new_password')

        # Validate Age
        try:
            age = int(age_str) if age_str else user.age 
        except ValueError:
            flash('Invalid age format.', 'danger')
            form_data = {k: v for k, v in request.form.items() if 'password' not in k}
            return render_template('edit_account.html', current_user_data=form_data, user=user, initials=initials)

        # Update basic information
        user.name = name if name else "Anonymous Wanderer"
        user.age = age

        # Email validation and update
        if email and email != user.email:
            existing_user_with_email = User.query.filter(User.email == email, User.id != user.id).first()
            if existing_user_with_email:
                flash('That email address is already in use by another account.', 'danger')
                form_data = {k: v for k, v in request.form.items() if 'password' not in k}
                return render_template('edit_account.html', current_user_data=form_data, user=user,initials=initials)
            user.email = email
            session['user'] = email 

        password_changed = False
        if new_password: 
            if not current_password_form:
                flash('Please enter your current password to set a new one.', 'danger')
                form_data = {k: v for k, v in request.form.items() if 'password' not in k}
                return render_template('edit_account.html', current_user_data=form_data, user=user,initials=initials)

            if user.password != current_password_form:
                flash('Incorrect current password.', 'danger')
                form_data = {k: v for k, v in request.form.items() if 'password' not in k}
                return render_template('edit_account.html', current_user_data=form_data, user=user,initials=initials)

            if new_password != confirm_new_password:
                flash('New passwords do not match.', 'danger')
                form_data = {k: v for k, v in request.form.items() if 'password' not in k}
                return render_template('edit_account.html', current_user_data=form_data, user=user,initials=initials)
            
            if len(new_password) < 6: # Example minimum length
                 flash('New password must be at least 6 characters long.', 'danger')
                 form_data = {k: v for k, v in request.form.items() if 'password' not in k}
                 return render_template('edit_account.html', current_user_data=form_data, user=user, initials=initials)

            user.password = new_password # Storing new password in plain text (INSECURE)
            password_changed = True
        
        try:
            db.session.commit()
            if password_changed:
                flash('Profile and password updated successfully!', 'success')
            else:
                flash('Profile updated successfully!', 'success')
            # It's good to redirect to GET after a successful POST to prevent re-submission on refresh
            # And also to show the updated data pre-filled in the form
            return redirect(url_for('auth.edit_account')) 
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error updating profile for user {user.id}: {e}")
            flash('An error occurred while updating your profile. Please try again.', 'danger')
            # If an error occurs during commit, re-render with existing form data (excluding passwords)
            form_data = {k: v for k, v in request.form.items() if 'password' not in k}
            # Pre-fill with the data that was *attempted* to be saved
            form_data['name'] = name 
            form_data['age'] = age_str # Use original string for age input
            form_data['email'] = email
            return render_template('edit_account.html', current_user_data=form_data, user=user, error='Database commit error.', initials=initials)


    # For GET request or if POST had errors that re-render the page
    current_user_data_for_form = {
        'name': user.name,
        'age': user.age,
        'email': user.email
    }
    return render_template('edit_account.html', current_user_data=current_user_data_for_form, user=user, initials=initials)



# ----------------------------------- CNN-LSTM MODEL ------------------------------------------------


import os
import io
import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf
from PIL import Image
from flask import request, jsonify, render_template, Blueprint
from tensorflow.keras.models import load_model

# Load CNN-LSTM model
MODEL_PATH = 'models/EfficientNet Model.h5'
model = load_model(MODEL_PATH)

# Class labels
CLASSES = [chr(i) for i in range(ord('A'), ord('Z') + 1)]

# Mediapipe hand detector setup
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
hands_detector = mp_hands.Hands(
    static_image_mode=True,
    max_num_hands=2,
    min_detection_confidence=0.3
)

# Image preprocessing
def preprocess_image(arr: np.ndarray, target_size=(224,224)) -> np.ndarray:
    # Resize, preprocess, add batch & sequence dims
    img = cv2.resize(arr, target_size)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = tf.keras.applications.efficientnet.preprocess_input(img)
    img = np.expand_dims(img, axis=0)   # batch
    img = np.expand_dims(img, axis=1)   # sequence
    return img

# Decode model prediction
def decode_prediction(pred: np.ndarray) -> str:
    idx = np.argmax(pred, axis=1)[0]
    return CLASSES[idx]

@auth_bp.route('/capture')
def capture_page():
    return render_template('pose_capture.html')

@auth_bp.route('/predict', methods=['POST'])
def predict():
    # Receive image blob
    file = request.files.get('image')
    if not file:
        return jsonify({'error': 'No image provided'}), 400

    # Read image into OpenCV frame
    data = file.read()
    nparr = np.frombuffer(data, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # Detect hands
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands_detector.process(rgb)
    if not results.multi_hand_landmarks:
        return jsonify({'error': 'No hand detected'}), 400

    # Combine landmarks of both hands into one bounding box
    h, w, _ = frame.shape
    all_xs, all_ys = [], []
    for hand_landmarks in results.multi_hand_landmarks:
        all_xs.extend([lm.x for lm in hand_landmarks.landmark])
        all_ys.extend([lm.y for lm in hand_landmarks.landmark])
    xmin, xmax = int(min(all_xs) * w), int(max(all_xs) * w)
    ymin, ymax = int(min(all_ys) * h), int(max(all_ys) * h)
    margin = 20
    xmin, ymin = max(0, xmin - margin), max(0, ymin - margin)
    xmax, ymax = min(w, xmax + margin), min(h, ymax + margin)

    # Crop combined region
    crop = frame[ymin:ymax, xmin:xmax]
    if crop.size == 0:
        return jsonify({'error': 'Invalid crop'}), 400

    # Draw debug overlay
    debug_frame = frame.copy()
    cv2.rectangle(debug_frame, (xmin, ymin), (xmax, ymax), (0, 255, 0), 2)
    for hand_landmarks in results.multi_hand_landmarks:
        mp_drawing.draw_landmarks(debug_frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)

    # Save debug images
    debug_crop_path = os.path.join("static/uploads", 'last_crop.jpg')
    debug_overlay_path = os.path.join("static/uploads", 'last_debug.jpg')
    cv2.imwrite(debug_crop_path, crop)
    cv2.imwrite(debug_overlay_path, debug_frame)

    # Preprocess and predict
    input_tensor = preprocess_image(crop)
    pred = model.predict(input_tensor)
    letter = decode_prediction(pred)

    print(pred)
    session["today_login"] = True

    return jsonify({
        'result': letter,
        'debug_crop_url': '/' + debug_crop_path,
        'debug_overlay_url': '/' + debug_overlay_path
    })