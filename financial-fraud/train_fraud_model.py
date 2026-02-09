# random forest classifier using sklearn

import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.metrics import confusion_matrix, precision_score, recall_score, f1_score
from sklearn.ensemble import RandomForestClassifier


# NOTE: this is the local kaggle/payments csv path
# change this if the dataset is moved
CSV_FILE = r"C:\Users\bryso\Downloads\PS_20174392719_1491204439457_log.csv\PS_20174392719_1491204439457_log.csv"

# where the trained pipeline gets saved
MODEL_OUT = "fraud_model.joblib"

# keep training from taking forever on a laptop
N_SAMPLES = 600_000
RANDOM_STATE = 42


def main():
    # load only what we need so it doesn't eat memory for no reason
    print("Loading dataset...")
    usecols = [
        "step", "type", "amount",
        "oldbalanceOrg", "newbalanceOrig",
        "oldbalanceDest", "newbalanceDest",
        "isFraud"
    ]

    df = pd.read_csv(CSV_FILE, usecols=usecols)

    # downsample so the run time is reasonable
    if len(df) > N_SAMPLES:
        df = df.sample(n=N_SAMPLES, random_state=RANDOM_STATE)

    print("Rows used:", len(df))
    print("Fraud rate:", df["isFraud"].mean())

    # split features/label
    X = df.drop(columns=["isFraud"])
    y = df["isFraud"].astype(int)

    # train/test split (stratify so fraud isn't missing in one side)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=0.2,
        stratify=y,
        random_state=RANDOM_STATE
    )

    # only categorical column here is tx type
    cat_cols = ["type"]
    num_cols = [c for c in X.columns if c not in cat_cols]

    # preprocessing: one-hot encode type, pass numbers through as-is
    preprocess = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), cat_cols),
        ("num", "passthrough", num_cols)
    ])

    # rf is a decent baseline and easy to train
    model = RandomForestClassifier(
        n_estimators=300,
        class_weight="balanced_subsample",
        random_state=RANDOM_STATE,
        n_jobs=-1
    )

    # pipeline = preprocess + model (so scoring scripts can just feed raw cols)
    pipe = Pipeline([
        ("preprocess", preprocess),
        ("model", model)
    ])

    print("Training model...")
    pipe.fit(X_train, y_train)

    # quick eval on holdout
    print("Evaluating...")
    y_pred = pipe.predict(X_test)

    cm = confusion_matrix(y_test, y_pred)
    precision = precision_score(y_test, y_pred)
    recall = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)

    print("Confusion matrix:")
    print(cm)
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"F1:        {f1:.4f}")

    # dump the whole pipeline so scoring stays simple later
    print("Saving model...")
    joblib.dump(pipe, MODEL_OUT)

    print("Saved ->", MODEL_OUT)


if __name__ == "__main__":
    main()
