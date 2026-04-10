from flask import Blueprint, render_template, request, redirect, url_for, session, jsonify, flash
from models import Lesson, UserLessonStatus, db, User, Course, Module, Unit, LessonStep, Question, ShopItem, UserItem
import random,json
from tertiary import get_initials, get_random_question
from email_validator import validate_email, EmailNotValidError
from flask_mail import Message
from itsdangerous import URLSafeTimedSerializer
from app import mail, app  # to use app config + mail instance
import time
from smtplib import SMTPException
from datetime import datetime, timedelta
import pytz
from models import ShopItem, UserItem # Add these to your imports

def safe_send_email(msg, retries=3, delay=3):
    """Send email with retry logic to handle intermittent network issues."""
    for attempt in range(1, retries + 1):
        try:
            mail.send(msg)
            return True
        except (OSError, SMTPException) as e:
            if attempt < retries:
                time.sleep(delay)
            else:
                return False

def generate_username(name):
    random_number = random.randint(1,100)
    username = "@" + name + str(random_number)
    while (User.query.filter_by(username=username).first()):
        random_number = random.randint(1,100)
        username = "@" + name + str(random_number)
    return username

s = URLSafeTimedSerializer(app.secret_key)

def generate_token(email):
    return s.dumps(email, salt='email-confirm')

def confirm_token(token, expiration=300):
    try:
        email = s.loads(token, salt='email-confirm', max_age=expiration)
    except Exception:
        return None
    return email

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

        try:
            # Validate and normalize email
            valid = validate_email(email, check_deliverability=True)
            email = valid.email  # normalized email (e.g. lowercase domain)

        except EmailNotValidError as e:
            # The email is not valid
            error_message = str(e)
            return render_template('SignUp.html', error=error_message)

        
        if User.query.filter_by(email=email).first():    
            error_message = "Email already exists."
            return render_template('sign_up.html', error=error_message)

        first_name, initials = get_initials(name)
        username = generate_username(first_name)
        print(username)
        new_user = User(age=age, name=name, email=email, password=password, username=username)
        new_user.is_verified = False
        db.session.add(new_user)
        db.session.commit()

        session['user'] = new_user.email
        session['user_id'] = new_user.id 

        token = generate_token(email)
        verify_url = url_for('auth.verify_email', token=token, _external=True)
        msg = Message('Verify your email for SignLingo', sender=app.config['MAIL_USERNAME'], recipients=[email])
        msg.body = f"Hi {name}, please verify your email by clicking this link: {verify_url}"
        
        if safe_send_email(msg):
            flash("Verification email sent! Please check your inbox.")
        else:
            flash("Registered successfully, but we couldn’t send the verification email. Please try again later.")

        return redirect(url_for('auth.start'))
    return render_template('sign_up.html')

@auth_bp.route('/verify/<token>')
def verify_email(token):
    email = confirm_token(token)
    if not email:
        return "Invalid or expired verification link."

    user = User.query.filter_by(email=email).first()
    if not user:
        return "User not found."

    user.is_verified = True
    db.session.commit()
    return redirect(url_for('auth.login'))

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        print(request.form) #! Debugging delete later
        email = request.form['email']
        password = request.form['password']

        user = User.query.filter_by(email=email, password=password).first()

        if user:
            if user.is_verified:
                session['user'] = email
                session['user_id'] = user.id 
                return redirect(url_for('auth.dashboard'))
            else:
                error_message =  "Account is not verified, please check your inbox and finish verification."

                token = generate_token(email)

                verify_url = url_for('auth.verify_email', token=token, _external=True)
                msg = Message('Verify your email for SignLingo', sender=app.config['MAIL_USERNAME'], recipients=[email])
                msg.body = f"Hi {user.name}, please verify your email by clicking this link: {verify_url}"
                
                safe_send_email(msg)

                return render_template('login.html', error=error_message)
        else:
            error_message =  "Invalid credentials."
            return render_template('login.html', error=error_message)
    return render_template('login.html')

@auth_bp.route('/dashboard', methods=['GET', 'POST'])
def dashboard():
    from datetime import datetime, timedelta
    from sqlalchemy import func

    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.login'))

    login_today = session.get("today_login")

    user = User.query.get(user_id)
    full_name = user.name
    first_name, initials = get_initials(full_name)

    all_users = User.query.order_by(User.points.desc()).all()
    user_rank = next((i + 1 for i, u in enumerate(all_users) if u.id == user_id), None)

    # ----------------- WEEKLY STREAK (Monday → Sunday of current week) -----------------
    indonesia_tz = pytz.timezone('Asia/Jakarta')
    
    today = datetime.now(indonesia_tz).date()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)

    activity_dates = db.session.query(
        func.date(UserLessonStatus.last_updated).label('activity_date')
    ).filter(
        UserLessonStatus.user_id == user_id,
        func.date(UserLessonStatus.last_updated).between(monday, sunday)
    ).distinct().all()

    # Convert to proper date objects
    active_dates = {datetime.strptime(date.activity_date, '%Y-%m-%d').date()
                    if isinstance(date.activity_date, str)
                    else date.activity_date
                    for date in activity_dates}

    # Build streak data for this week
    streak_data = []
    for i in range(7):  # Monday → Sunday
        check_date = monday + timedelta(days=i)
        day_abbr = check_date.strftime('%a')[0]
        is_active = check_date in active_dates
        streak_data.append({'day': day_abbr, 'date': check_date, 'is_active': is_active})

    # --- Correct current_streak counting (backward) ---
    current_streak = 0
    for i in range(6, -1, -1):  # from Sunday → Monday
        day_entry = streak_data[i]
        if day_entry['date'] > today:
            continue
        if day_entry['is_active']:
            current_streak += 1
        else:
            break 

    lessons, prog, completed, total = get_sidebar_data(user_id)

    modules_db = Module.query.order_by(Module.order).all()
    dynamic_modules = []
    is_unlocked = True # The first module is always unlocked by default

    for m in modules_db:
        mod_total = 0
        mod_completed = 0
        for u in m.units:
            for l in u.lessons:
                mod_total += 1
                status = UserLessonStatus.query.filter_by(user_id=user_id, lesson_id=l.id).first()
                if status and status.status == 'completed':
                    mod_completed += 1
        
        prog_percent = (mod_completed / mod_total * 100) if mod_total > 0 else 0
        
        dynamic_modules.append({
            'id': m.id,
            'title': m.title,
            'progress': prog_percent,
            'is_unlocked': is_unlocked,
            'total_lessons': mod_total
        })
        
        # To unlock the NEXT module in the loop, THIS module must be 100% finished
        # (and must actually have lessons inside it)
        if mod_total > 0 and mod_completed == mod_total:
            is_unlocked = True
        else:
            is_unlocked = False

    return render_template(
        "dashboard.html",
        full_name=full_name,
        user_id=user_id,
        first_name=first_name,
        initials=initials,
        login_today=login_today,
        user_points=user.points,
        user_league=user.league,
        user_rank=user_rank,
        streak_data=streak_data,
        current_streak=current_streak,
        today=today,
        user=user,
        lessons=lessons,
        module_progress_percent=prog,
        completed_lessons_count=completed,
        total_lessons_count=total,
        dynamic_modules=dynamic_modules
    )

@auth_bp.route('/start', methods=['GET', 'POST'])
def start():
    return render_template('start.html')

@auth_bp.route('/roadmap', methods=['GET', 'POST'])
def roadmap():
    from datetime import datetime, timedelta
    from sqlalchemy import func

    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.login'))

    login_today = session.get("today_login")

    user = User.query.get(user_id)
    full_name = user.name
    first_name, initials = get_initials(full_name)

    all_users = User.query.order_by(User.points.desc()).all()
    user_rank = next((i + 1 for i, u in enumerate(all_users) if u.id == user_id), None)

    # ----------------- WEEKLY STREAK (Monday → Sunday of current week) -----------------
    indonesia_tz = pytz.timezone('Asia/Jakarta')
    
    today = datetime.now(indonesia_tz).date()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)

    activity_dates = db.session.query(
        func.date(UserLessonStatus.last_updated).label('activity_date')
    ).filter(
        UserLessonStatus.user_id == user_id,
        func.date(UserLessonStatus.last_updated).between(monday, sunday)
    ).distinct().all()

    # Convert to proper date objects
    active_dates = {datetime.strptime(date.activity_date, '%Y-%m-%d').date()
                    if isinstance(date.activity_date, str)
                    else date.activity_date
                    for date in activity_dates}

    # Build streak data for this week
    streak_data = []
    for i in range(7):  # Monday → Sunday
        check_date = monday + timedelta(days=i)
        day_abbr = check_date.strftime('%a')[0]
        is_active = check_date in active_dates
        streak_data.append({'day': day_abbr, 'date': check_date, 'is_active': is_active})

    # --- Correct current_streak counting (backward) ---
    current_streak = 0
    for i in range(6, -1, -1):  # from Sunday → Monday
        day_entry = streak_data[i]
        if day_entry['date'] > today:
            continue
        if day_entry['is_active']:
            current_streak += 1
        else:
            break 

    return render_template(
        "roadmap.html",
        full_name=full_name,
        user_id=user_id,
        first_name=first_name,
        initials=initials,
        login_today=login_today,
        user_points=user.points,
        user_league=user.league,
        user_rank=user_rank,
        streak_data=streak_data,
        current_streak=current_streak,
        today=today,
        user=user
    )


@auth_bp.route('/premium', methods=['GET', 'POST'])
def premium():
    user_id = session.get('user_id')
    print(user_id)
    
    if not user_id:
        return redirect(url_for('auth.login'))
    
    login_today = session.get("today_login")
    print(login_today)

    user = User.query.get(user_id)
    full_name = user.name

    first_name,initials = get_initials(full_name)
    return render_template('premium.html',full_name=full_name,first_name=first_name,initials=initials, user=user)

@auth_bp.route('/package', methods=['GET','POST'])
def package():
    user_id = session.get('user_id')
    print(user_id)
    
    if not user_id:
        return redirect(url_for('auth.login'))
    
    login_today = session.get("today_login")
    print(login_today)

    user = User.query.get(user_id)
    full_name = user.name

    first_name,initials = get_initials(full_name)
    if request.method == 'POST':
        if 'user_id' not in session:
            flash('Please log in to select a plan.', 'warning')
            return redirect(url_for('auth.login'))

        selected_plan = request.form.get('plan')
        
        # Store the plan in the session or process it
        # For now, we'll just pass it to the payment page
        
        return render_template('payment.html', plan=selected_plan, 
                               full_name=full_name, 
                               first_name=first_name, 
                               initials=initials,
                               user=user)
    return render_template('package.html',                                
                            full_name=full_name, 
                               first_name=first_name, 
                               initials=initials,
                               user=user)

@auth_bp.route('/payment', methods=['GET', 'POST'])
def payment():
    return render_template('payment.html')

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

            msg = Message('Password Reset Token', sender=app.config['MAIL_USERNAME'], recipients=[email])
            msg.body = f"DEBUG: Password reset token for {user.email}: {token} \n DEBUG: Reset URL: {url_for('auth.reset_password', token=token, _external=True)}"
            safe_send_email(msg)

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

    user = User.query.get(user_id)

    full_name = user.name

    first_name, initials = get_initials(full_name)

    return render_template('leaderboard.html',
                           current_user=current_user,
                           full_name=full_name,
                           friends_leaderboard=friends_leaderboard,
                           initials=initials,
                           league_users=league_users,
                           league_name=current_user.league,
                           user = user)

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

@auth_bp.route('/search-users')
def search_users():
    """
    Searches for users based on a query string.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'User not logged in'}), 401

    query = request.args.get('q', '')

    if len(query) < 2:
        return jsonify([]) # Return empty list if query is too short

    # Search for users whose name contains the query string, case-insensitive
    # and exclude the current user from the results.
    users = User.query.filter(
        User.name.ilike(f'%{query}%'),
        User.id != user_id
    ).all()

    # Format the results as a list of dictionaries
    results = [{'id': user.id, 'name': user.name} for user in users]

    return jsonify(results)

# ----------------------------------- RESULT SUMMARY SYSTEM -----------------------------------

@auth_bp.route('/save-session-results', methods=['POST'])
def save_session_results():
    """
    Called by both game_page and ml_game when a session ends.
    Saves results temporarily in the Flask session (not the DB).
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'User not logged in'}), 401

    data = request.get_json()
    session_type = data.get('type')  # 'game' or 'ml'
    xp = data.get('xp', 0)
    accuracy = data.get('accuracy', 0)
    skipped = data.get('skipped', False)

    if session_type not in ['game', 'ml']:
        return jsonify({'success': False, 'error': 'Invalid session type'}), 400

    session_key = f"{session_type}_results"
    session[session_key] = {
        'xp': xp,
        'accuracy': accuracy,
        'skipped': skipped
    }

    return jsonify({'success': True, 'message': f'{session_type} results saved.'})


@auth_bp.route('/result-summary')
def result_summary():
    """
    Renders the result summary page (HTML).
    """
    user_id = session.get('user_id')
    if not user_id:
        flash('Please log in to view your results.', 'warning')
        return redirect(url_for('auth.login'))

    return render_template('result_summary.html', user=session.get('user'))


@auth_bp.route('/get-summary-results')
def get_summary_results():
    """
    Combines the results of both game and ML practice sessions.
    Skipped sessions are not counted toward accuracy.
    """
    game_data = session.get('game_results', {'xp': 0, 'accuracy': 0, 'skipped': True})
    ml_data = session.get('ml_results', {'xp': 0, 'accuracy': 0, 'skipped': True})

    total_xp = 0
    total_accuracy = 0
    completed_count = 0

    for data in [game_data, ml_data]:
        if not data.get('skipped', False):
            total_xp += data.get('xp', 0)
            total_accuracy += data.get('accuracy', 0)
            completed_count += 1

    avg_accuracy = (total_accuracy / completed_count) if completed_count > 0 else 0

    return jsonify({
        'total_xp': total_xp,
        'average_accuracy': avg_accuracy
    })

# ----------------------------------- GAME PAGE ------------------------------------------------
@auth_bp.route('/ml-game', methods=['GET', 'POST'])
def ml_game():
    user_id = session.get('user_id')
    if not user_id: return redirect(url_for('auth.login'))
    user = User.query.get(user_id)
    lessons, prog, completed, total = get_sidebar_data(user_id)
    
    active_step = get_active_step(user_id, '/ml-game') # Get the active step!

    return render_template("ml_game.html", user=user, lessons=lessons, module_progress_percent=prog, completed_lessons_count=completed, total_lessons_count=total, module_accuracy="N/A", active_step=active_step)

@auth_bp.route('/decrement_life', methods=['POST'])
def decrement_life():
    if 'user_id' not in session:
        # User not logged in, return an error
        return jsonify({'success': False, 'error': 'User not authenticated'}), 401

    user = User.query.get(session['user_id'])
    if user:
        if user.lives > 0:
            user.lives -= 1
            db.session.commit()
        # Return the new number of lives
        return jsonify({'success': True, 'new_lives': user.lives})
    
    return jsonify({'success': False, 'error': 'User not found'}), 404

# In routes.py
@auth_bp.route('/video-learning')
def video_learning():
    user_id = session.get('user_id')
    if not user_id: return redirect(url_for('auth.login'))
    user = User.query.get(user_id)
    lessons, prog, completed, total = get_sidebar_data(user_id)
    
    active_step = get_active_step(user_id, '/video-learning') # Get the active step!

    return render_template("video_learning.html", user=user, lessons=lessons, module_progress_percent=prog, completed_lessons_count=completed, total_lessons_count=total, active_step=active_step)

@auth_bp.route('/play/<int:lesson_id>')
def play_lesson(lesson_id):
    """Router for explicitly starting or replaying a specific lesson."""
    session['current_lesson_id'] = lesson_id
    lesson = Lesson.query.get_or_404(lesson_id)
    first_step = LessonStep.query.filter_by(lesson_id=lesson.id).order_by(LessonStep.order).first()
    return redirect(first_step.url)

@auth_bp.route('/play/continue')
def play_continue():
    """Smart router for the 'Continue Module' button."""
    user_id = session.get('user_id')
    if not user_id: return redirect(url_for('auth.login'))
    
    # Find the first incomplete lesson and route to it
    for lesson in Lesson.query.order_by(Lesson.order).all():
        status = UserLessonStatus.query.filter_by(user_id=user_id, lesson_id=lesson.id).first()
        if not status or status.status != 'completed':
            return redirect(url_for('auth.play_lesson', lesson_id=lesson.id))
    
    # If all lessons are completed, just replay the last one
    last_lesson = Lesson.query.order_by(Lesson.order.desc()).first()
    return redirect(url_for('auth.play_lesson', lesson_id=last_lesson.id if last_lesson else 1))

@auth_bp.route('/play/module/<int:module_id>')
def play_module(module_id):
    """Router for explicitly starting or continuing a specific module."""
    user_id = session.get('user_id')
    if not user_id: return redirect(url_for('auth.login'))
    
    module = Module.query.get_or_404(module_id)
    
    # 1. Find the first incomplete lesson in THIS module
    for unit in module.units:
        for lesson in unit.lessons:
            status = UserLessonStatus.query.filter_by(user_id=user_id, lesson_id=lesson.id).first()
            if not status or status.status != 'completed':
                return redirect(url_for('auth.play_lesson', lesson_id=lesson.id))
    
    # 2. If all are completed, replay the very last lesson of this module
    last_lesson = None
    for unit in module.units:
        for lesson in unit.lessons:
            last_lesson = lesson
            
    if last_lesson:
        return redirect(url_for('auth.play_lesson', lesson_id=last_lesson.id))
        
    return redirect(url_for('auth.dashboard'))

def get_sidebar_data(user_id):
    """Smart helper to build the sidebar based on the new Step architecture."""
    all_db_lessons = Lesson.query.order_by(Lesson.order).all()
    user_lessons_with_status = []
    completed_lessons_count = 0
    total_lessons_count = len(all_db_lessons)

    for db_lesson in all_db_lessons:
        status_entry = UserLessonStatus.query.filter_by(user_id=user_id, lesson_id=db_lesson.id).first()
        current_status = status_entry.status if status_entry else 'not_started'
        if current_status == 'completed':
            completed_lessons_count += 1
        
        # Determine if this specific lesson is currently being played
        is_current_page_lesson = False
        if session.get('current_lesson_id') == db_lesson.id:
            is_current_page_lesson = True
        
        display_status = current_status
        if is_current_page_lesson and current_status != 'completed':
            display_status = 'current'

        user_lessons_with_status.append({
            'title': db_lesson.title,
            'url': url_for('auth.play_lesson', lesson_id=db_lesson.id), # Uses the new router!
            'status': display_status,
            'lesson_key': 'sidebar_link' 
        })
    
    module_progress_percent = (completed_lessons_count / total_lessons_count) * 100 if total_lessons_count > 0 else 0
    return user_lessons_with_status, module_progress_percent, completed_lessons_count, total_lessons_count

def get_active_step(user_id, current_url):
    """Finds the correct step based on the explicitly playing lesson."""
    # 1. Prioritize the lesson the user explicitly clicked on the roadmap
    current_lesson_id = session.get('current_lesson_id')
    if current_lesson_id:
        lesson = Lesson.query.get(current_lesson_id)
        if lesson:
            for step in lesson.steps:
                if step.url == current_url:
                    return step
    
    # 2. Fallback: Find the user's active progress
    for lesson in Lesson.query.order_by(Lesson.order).all():
        status_entry = UserLessonStatus.query.filter_by(user_id=user_id, lesson_id=lesson.id).first()
        if not status_entry or status_entry.status != 'completed':
            session['current_lesson_id'] = lesson.id
            for step in lesson.steps:
                if step.url == current_url:
                    return step
            break 
            
    return LessonStep.query.filter_by(url=current_url).first()

@auth_bp.route('/gamepage')
def gamepage():
    user_id = session.get('user_id')
    if not user_id: return redirect(url_for('auth.login'))
    user = User.query.get(user_id)
    session.pop('questions_asked', None) 
    lessons, prog, completed, total = get_sidebar_data(user_id)
    
    active_step = get_active_step(user_id, '/gamepage') # Get the active step!

    return render_template("game_page.html", user=user, lessons=lessons, module_progress_percent=prog, completed_lessons_count=completed, total_lessons_count=total, active_step=active_step)

@auth_bp.route('/mark-lesson-status', methods=['POST'])
def mark_lesson_status():
    user_id = session.get('user_id')
    if not user_id: return jsonify({'success': False, 'error': 'User not logged in'}), 401

    data = request.json
    step_key = data.get('lesson_key') 

    step = LessonStep.query.filter_by(step_key=step_key).first()
    if not step: return jsonify({'success': False, 'error': 'Step not found'}), 404

    lesson = step.lesson
    status_entry = UserLessonStatus.query.filter_by(user_id=user_id, lesson_id=lesson.id).first()
    
    if not status_entry:
        status_entry = UserLessonStatus(user_id=user_id, lesson_id=lesson.id)
        db.session.add(status_entry)
    
    # Check if this step is the LAST step in the lesson sequence
    last_step = LessonStep.query.filter_by(lesson_id=lesson.id).order_by(LessonStep.order.desc()).first()
    
    if step.id == last_step.id:
        status_entry.status = 'completed' # Finished the whole sequence!
    else:
        if status_entry.status != 'completed': # Don't downgrade if replaying
            status_entry.status = 'in_progress'
            
    db.session.commit()
    return jsonify({'success': True})

@auth_bp.route('/course')
def course():
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.login'))
    
    user = User.query.get(user_id)
    first_name, initials = get_initials(user.name)
    
    # Grab the courses from the database instead of JSON
    db_courses = Course.query.all()

    return render_template("courses_final.html", user=user, courses=db_courses, initials=initials, first_name=first_name, login_today=session.get("today_login"), full_name=user.name)

@auth_bp.route('/api/lessons/<lesson_key>/questions')
def get_lesson_questions(lesson_key):
    """Fetches the specific questions for a given lesson level step."""
    # The frontend calls it 'lesson_key', but in our DB it is now 'step_key'
    step = LessonStep.query.filter_by(step_key=lesson_key).first()
    
    if not step:
        return jsonify({'error': 'Step not found'}), 404
        
    # Questions are now linked to the LessonStep via step_id
    questions = Question.query.filter_by(step_id=step.id).order_by(Question.order).all()
    
    response = []
    for q in questions:
        response.append({
            'id': q.id,
            'type': q.question_type,
            'prompt': q.prompt_text,
            'image': q.image_url,
            'answer': q.correct_answer,
            'choices': q.choices
        })
        
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
            return render_template('edit_account.html', current_user_data=form_data, user=user, initials=initials, full_name=full_name)

        # Update basic information
        user.name = name if name else "Anonymous Wanderer"
        user.age = age

        # Email validation and update
        if email and email != user.email:
            existing_user_with_email = User.query.filter(User.email == email, User.id != user.id).first()
            if existing_user_with_email:
                flash('That email address is already in use by another account.', 'danger')
                form_data = {k: v for k, v in request.form.items() if 'password' not in k}
                return render_template('edit_account.html', current_user_data=form_data, user=user,initials=initials, full_name=full_name)
            user.email = email
            session['user'] = email 

        password_changed = False
        if new_password: 
            if not current_password_form:
                flash('Please enter your current password to set a new one.', 'danger')
                form_data = {k: v for k, v in request.form.items() if 'password' not in k}
                return render_template('edit_account.html', current_user_data=form_data, user=user,initials=initials, full_name=full_name)

            if user.password != current_password_form:
                flash('Incorrect current password.', 'danger')
                form_data = {k: v for k, v in request.form.items() if 'password' not in k}
                return render_template('edit_account.html', current_user_data=form_data, user=user,initials=initials, full_name=full_name)

            if new_password != confirm_new_password:
                flash('New passwords do not match.', 'danger')
                form_data = {k: v for k, v in request.form.items() if 'password' not in k}
                return render_template('edit_account.html', current_user_data=form_data, user=user,initials=initials, full_name=full_name)
            
            if len(new_password) < 6: # Example minimum length
                 flash('New password must be at least 6 characters long.', 'danger')
                 form_data = {k: v for k, v in request.form.items() if 'password' not in k}
                 return render_template('edit_account.html', current_user_data=form_data, user=user, initials=initials, full_name=full_name)

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
            return render_template('edit_account.html', current_user_data=form_data, user=user, error='Database commit error.', initials=initials, full_name=full_name)


    # For GET request or if POST had errors that re-render the page
    current_user_data_for_form = {
        'name': user.name,
        'age': user.age,
        'email': user.email
    }
    return render_template('edit_account.html', current_user_data=current_user_data_for_form, user=user, initials=initials, full_name=full_name)


# ----------------------------------- SHOP Functionality --------------------------------------------
@auth_bp.route('/shop', methods=['GET', 'POST'])
def shop():
    from datetime import datetime, timedelta
    from sqlalchemy import func
    import pytz

    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth.login'))
    
    login_today = session.get("today_login")
    user = User.query.get(user_id)
    full_name = user.name
    first_name, initials = get_initials(full_name)

    # --- Fetch Shop Data ---
    shop_items = ShopItem.query.all()
    
    # Create a dictionary for quick lookup of inventory quantities: {item_id: quantity}
    user_inventory_map = {item.item_id: item.quantity for item in user.inventory.all()}

    # Calculate Streak (Existing logic preserved)
    indonesia_tz = pytz.timezone('Asia/Jakarta')
    today = datetime.now(indonesia_tz).date()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)

    activity_dates = db.session.query(
        func.date(UserLessonStatus.last_updated).label('activity_date')
    ).filter(
        UserLessonStatus.user_id == user_id,
        func.date(UserLessonStatus.last_updated).between(monday, sunday)
    ).distinct().all()

    active_dates = {datetime.strptime(date.activity_date, '%Y-%m-%d').date()
                    if isinstance(date.activity_date, str)
                    else date.activity_date
                    for date in activity_dates}

    streak_data = []
    for i in range(7):
        check_date = monday + timedelta(days=i)
        is_active = check_date in active_dates
        streak_data.append({'date': check_date, 'is_active': is_active})

    current_streak = 0
    for i in range(6, -1, -1):
        day_entry = streak_data[i]
        if day_entry['date'] > today:
            continue
        if day_entry['is_active']:
            current_streak += 1
        else:
            break 
    
    return render_template('shop.html', 
                           full_name=full_name, 
                           first_name=first_name, 
                           initials=initials, 
                           user=user,
                           login_today=login_today,
                           current_streak=current_streak,
                           shop_items=shop_items,           # Pass items to template
                           user_inventory_map=user_inventory_map) # Pass inventory map

@auth_bp.route('/buy-item', methods=['POST'])
def buy_item():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'Please log in.'}), 401

    data = request.get_json()
    item_id = data.get('item_id')

    user = User.query.get(user_id)
    item = ShopItem.query.get(item_id)

    if not item:
        return jsonify({'success': False, 'message': 'Item not found.'}), 404
    
    if item.item_key == 'refill_hearts' and user.lives >= 5:
        return jsonify({'success': False, 'message': 'Your health is already full!'}), 400

    # Check if user has enough points
    if user.points < item.price:
        return jsonify({'success': False, 'message': 'Not enough XP.'}), 400

    try:
        # Deduct points
        user.points -= item.price

        if item.item_key == 'refill_hearts':
            user.lives = 5  # Max lives
        else:
            # Add to inventory
            user_item = UserItem.query.filter_by(user_id=user.id, item_id=item.id).first()
            if user_item:
                user_item.quantity += 1
            else:
                new_inventory_item = UserItem(user_id=user.id, item_id=item.id, quantity=1)
                db.session.add(new_inventory_item)

        db.session.commit()
        
        return jsonify({
            'success': True, 
            'message': f'Successfully purchased {item.name}!',
            'new_balance': user.points,
            'new_lives': user.lives
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Transaction failed.'}), 500
    
# ----------------------------------- CNN-LSTM MODEL ------------------------------------------------


import os
import io
import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf
from PIL import Image
from flask import request, jsonify, render_template, Blueprint
import h5py, json

# Load bisindo static (MediaPipe keypoint) model.
# The model was saved with a newer Keras that includes a `quantization_config` field
# and a DTypePolicy dtype format — both incompatible with the Docker container's Keras.
# Solution: manually rebuild the exact Sequential architecture and load weights directly.
MODEL_PATH = 'models/bisindo_static_model.h5'

def _build_bisindo_model():
    """Rebuild bisindo_static_model architecture manually and load weights from h5.
    Architecture (from model_config): input=63 → Dense(256,relu) → BN → Dropout(0.4)
    → Dense(128,relu) → BN → Dropout(0.3) → Dense(64,relu) → Dropout(0.2) → Dense(26,softmax)
    """
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import Dense, Dropout, BatchNormalization, Input

    m = Sequential([
        Input(shape=(126,)),
        Dense(256, activation='relu'),
        BatchNormalization(momentum=0.99, epsilon=0.001),
        Dropout(0.4),
        Dense(128, activation='relu'),
        BatchNormalization(momentum=0.99, epsilon=0.001),
        Dropout(0.3),
        Dense(64, activation='relu'),
        Dropout(0.2),
        Dense(26, activation='softmax'),
    ])
    m.compile(optimizer='adam', loss='categorical_crossentropy')

    # Load weights layer-by-layer from the h5 file's model_weights group
    with h5py.File(MODEL_PATH, 'r') as f:
        wg = f['model_weights']
        layer_names = [n.decode('utf-8') if isinstance(n, bytes) else n
                       for n in wg.attrs.get('layer_names', [])]
        keras_layers = [l for l in m.layers if l.weights]
        ki = 0
        for ln in layer_names:
            if ln not in wg:
                continue
            grp = wg[ln]
            wnames = [n.decode('utf-8') if isinstance(n, bytes) else n
                      for n in grp.attrs.get('weight_names', [])]
            weights = [grp[wn][()] for wn in wnames]
            if weights and ki < len(keras_layers):
                keras_layers[ki].set_weights(weights)
                ki += 1
    return m

try:
    model = _build_bisindo_model()
except Exception as e:
    raise RuntimeError(f"Failed to load bisindo_static_model: {e}")

# Class labels (A–Z)
CLASSES = [chr(i) for i in range(ord('A'), ord('Z') + 1)]

# MediaPipe hand detector setup
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
hands_detector = mp_hands.Hands(
    static_image_mode=True,
    max_num_hands=2,
    min_detection_confidence=0.3
)

def normalize_landmarks(landmarks: np.ndarray) -> np.ndarray:
    """Normalize landmarks relative to wrist (index 0) and hand scale.
    Matches the normalization applied during bisindo_static_model training."""
    wrist = landmarks[0].copy()
    landmarks = landmarks - wrist
    scale = np.linalg.norm(landmarks[9])  # middle finger MCP
    if scale > 0:
        landmarks = landmarks / scale
    return landmarks

def extract_keypoints(hand_landmarks_list) -> np.ndarray:
    """Flatten up to 2 hands × 21 landmarks × 3 coords into a (1, 126) array.
    Each hand is normalized (wrist-relative + scale) before flattening.
    Missing second hand is zero-padded."""
    keypoints = []
    for i in range(2):
        if i < len(hand_landmarks_list):
            lms = hand_landmarks_list[i].landmark
            arr = np.array([[lm.x, lm.y, lm.z] for lm in lms], dtype=np.float32)
            arr = normalize_landmarks(arr)
            keypoints.extend(arr.flatten().tolist())
        else:
            keypoints.extend([0.0] * (21 * 3))  # zero-pad missing hand
    return np.array(keypoints, dtype=np.float32).reshape(1, 126)

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

    # Detect hands with MediaPipe
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands_detector.process(rgb)
    if not results.multi_hand_landmarks:
        return jsonify({'error': 'No hand detected'}), 400

    # Draw debug overlay (bounding box + landmarks)
    h, w, _ = frame.shape
    debug_frame = frame.copy()
    all_xs, all_ys = [], []
    for hand_landmarks in results.multi_hand_landmarks:
        all_xs.extend([lm.x for lm in hand_landmarks.landmark])
        all_ys.extend([lm.y for lm in hand_landmarks.landmark])
        mp_drawing.draw_landmarks(debug_frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)
    xmin = max(0, int(min(all_xs) * w) - 20)
    ymin = max(0, int(min(all_ys) * h) - 20)
    xmax = min(w, int(max(all_xs) * w) + 20)
    ymax = min(h, int(max(all_ys) * h) + 20)
    cv2.rectangle(debug_frame, (xmin, ymin), (xmax, ymax), (0, 255, 0), 2)

    # Save debug images
    debug_crop_path = os.path.join("static/uploads", 'last_crop.jpg')
    debug_overlay_path = os.path.join("static/uploads", 'last_debug.jpg')
    crop = frame[ymin:ymax, xmin:xmax]
    if crop.size > 0:
        cv2.imwrite(debug_crop_path, crop)
    cv2.imwrite(debug_overlay_path, debug_frame)

    # Extract keypoints and predict (bisindo_static_model takes 126 landmark values)
    input_tensor = extract_keypoints(results.multi_hand_landmarks)
    pred = model.predict(input_tensor)
    confidence = float(np.max(pred))
    letter = decode_prediction(pred)

    print(f"Prediction: {letter}, Confidence: {confidence}")
    session["today_login"] = True

    return jsonify({
        'result': letter,
        'confidence': confidence,
        'debug_crop_url': '/' + debug_crop_path,
        'debug_overlay_url': '/' + debug_overlay_path
    })


@auth_bp.route('/magic-touch', methods=['GET', 'POST'])
def magic_touch():
    user_id = session.get('user_id')
    if not user_id:
        flash('Please log in to play Magic Touch.', 'warning')
        return redirect(url_for('auth.login'))
        
    user = User.query.get(user_id)
    return render_template("magic_touch_game.html", user=user)