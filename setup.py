from setuptools import setup, find_packages

setup(
    name='football-alert',
    version='0.1',
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        # No external dependencies - mock server uses only Python stdlib
    ],
)