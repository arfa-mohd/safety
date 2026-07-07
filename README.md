# safety
# AI-Based Road Pothole Detection System

This project is an AI-based web application that detects road potholes using the YOLOv8 object detection model. It allows users to detect potholes from images, videos, and a live camera feed. The detected results can be viewed through a simple web interface, and reports are stored for future reference.

The main goal of this project is to help identify damaged roads quickly and support road maintenance with the help of Artificial Intelligence.

## Features

* Detect potholes from uploaded images
* Detect potholes from videos
* Real-time pothole detection using a webcam
* YOLOv8-based object detection
* Save detection results
* Generate PDF reports
* Store reports using SQLite database
* Simple and user-friendly interface

## Technologies Used

* Python
* Flask
* YOLOv8 (Ultralytics)
* OpenCV
* HTML
* CSS
* JavaScript
* SQLite
* NumPy
* Pillow
* ReportLab

## Project Structure

```text
safety/
│── app.py
│── model/
│── templates/
│── static/
│── detections/
│── reports/
│── safety.db
│── README.md
│── requirements.txt
```

## Installation

Clone the repository:

```bash
git clone https://github.com/arfa-mohd/safety.git
```

Move into the project folder:

```bash
cd safety
```

Install the required packages:

```bash
pip install -r requirements.txt
```

If the requirements file is not available, install the packages manually:

```bash
pip install ultralytics flask opencv-python numpy pillow reportlab python-dotenv
```

## Running the Project

Start the application by running:

```bash
python app.py
```

Then open your browser and go to:

```text
http://127.0.0.1:8082/
```

## How It Works

1. Open the application.
2. Upload an image or video, or use the live camera.
3. The YOLOv8 model detects potholes.
4. Detection results are displayed on the screen.
5. Reports are generated and saved in the database.

## Future Improvements

* GPS location support
* Road crack detection
* Google Maps integration
* Mobile application
* Cloud deployment
* Severity classification

## Author
## Demo Login Credentials

You can use the following demo accounts to access the application.

### Government Authority Login

* **Email:** `govt@authority.gov`
* **Password:** `govt123`

### Public User Login

Create a new account using the **Register** option, or use any existing public user account available in the database.


**Mohamed Arfath**

B.Tech – Artificial Intelligence and Data Science

GitHub: https://github.com/arfa-mohd/safety

## License

This project showcases the implementation of YOLOv8 for intelligent road pothole detection using image, video, and real-time camera input.
